#!/usr/bin/env bash
set -e

# 参数初始化
ZIP_URL=""
LOCAL_ZIP=""
EXPECTED_SHA256=""
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
USE_DEFAULT_REPOSITORY=false
ALLOW_SAME_OR_DOWNGRADE=false
NON_INTERACTIVE=false

# 参数解析
while [[ $# -gt 0 ]]; do
  case "$1" in
    --zip-url|-u)
      ZIP_URL="$2"
      shift 2
      ;;
    --local-zip|-f)
      LOCAL_ZIP="$2"
      shift 2
      ;;
    --sha256|-s)
      EXPECTED_SHA256="$2"
      shift 2
      ;;
    --token|-t)
      GITHUB_TOKEN="$2"
      shift 2
      ;;
    --default-repo)
      USE_DEFAULT_REPOSITORY=true
      shift
      ;;
    --allow-downgrade)
      ALLOW_SAME_OR_DOWNGRADE=true
      shift
      ;;
    --non-interactive|-y)
      NON_INTERACTIVE=true
      shift
      ;;
    *)
      echo "未知参数: $1"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
ROOT="$( cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd )"
APP_DIR="$ROOT/lsby-playground-ts-service.app"
DATA_DIR="$ROOT/data"
DB_DIR="$DATA_DIR/db"
BACKUPS_DIR="$DATA_DIR/backups"
STAGING_DIR="$DATA_DIR/update-staging"
WORK_DIR="$DATA_DIR/update-work"
PREVIOUS_ROOT_DIR="$WORK_DIR/previous-root"
PREVIOUS_ROOT_MANIFEST="$WORK_DIR/previous-root-entries.txt"
DB_BACKUP_DIR="$WORK_DIR/db.backup"
MARKER_PATH="$DATA_DIR/update-in-progress"
PACKAGE_PATH="$APP_DIR/Contents/Resources/app/package.json"
APP_PROCESS_NAME="lsby-playground-ts-service"

DOWNLOAD_SHA256="$EXPECTED_SHA256"

log_info() {
  echo "$1"
}

log_error() {
  echo -e "\033[31m$1\033[0m" >&2
}

assert_child_path() {
  local parent="$1"
  local child="$2"
  local full_parent
  local full_child
  full_parent="$(cd "$parent" 2>/dev/null && pwd -P)" || full_parent="$parent"
  full_child="$(cd "$(dirname "$child")" 2>/dev/null && pwd -P)/$(basename "$child")" || full_child="$child"
  if [[ "$full_child" != "$full_parent"* ]]; then
    log_error "路径越过允许目录: $child"
    exit 1
  fi
}

remove_safe_path() {
  local target_path="$1"
  if [ -e "$target_path" ] || [ -L "$target_path" ]; then
    assert_child_path "$ROOT" "$target_path"
    rm -rf "$target_path"
  fi
}

get_architecture() {
  local arch
  arch="$(uname -m)"
  if [ "$arch" = "arm64" ] || [ "$arch" = "aarch64" ]; then
    echo "arm64"
  else
    echo "x64"
  fi
}

read_json_field() {
  local file="$1"
  local field="$2"
  if command -v node >/dev/null 2>&1; then
    node -e "try { const obj = JSON.parse(require('fs').readFileSync('$file', 'utf8')); const val = obj['$field']; if (typeof val === 'object' && val !== null) { console.log(val.url || ''); } else { console.log(val || ''); } } catch {}"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import json, sys; d=json.load(open('$file')); val=d.get('$field', ''); print(val.get('url', '') if isinstance(val, dict) else val)"
  else
    grep -o "\"$field\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$file" | head -n 1 | sed -E "s/\"$field\"[[:space:]]*:[[:space:]]*\"([^\"]*)\"/\1/"
  fi
}

get_repository_url() {
  local pkg_file="$1"
  read_json_field "$pkg_file" "repository"
}

get_github_repository() {
  local repo_url="$1"
  local clean_url
  clean_url="$(echo "$repo_url" | sed -e 's/^git+//' -e 's/\.git$//' | xargs)"
  local repo
  repo="$(echo "$clean_url" | sed -E -n 's#.*github\.com[/:]+([^/]+/[^/#]+).*#\1#p')"
  if [ -z "$repo" ]; then
    log_error "无法从地址识别 GitHub 仓库: $repo_url"
    exit 1
  fi
  echo "$repo"
}

read_github_token() {
  if [ -n "$GITHUB_TOKEN" ] || [ "$NON_INTERACTIVE" = true ]; then
    return
  fi
  log_info "如果这是私有 GitHub 仓库，请输入有仓库读取权限的 Token；公开仓库直接回车。"
  read -r -s -p "GitHub Token: " input_token
  echo ""
  if [ -n "$input_token" ]; then
    GITHUB_TOKEN="$input_token"
  fi
}

download_file() {
  local url="$1"
  local destination="$2"
  log_info "正在下载: $url"
  curl -sSL -H "User-Agent: lsby-electron-manual-updater" "$url" -o "$destination"
}

version_gt() {
  local v1="$1"
  local v2="$2"
  v1="${v1#v}"
  v2="${v2#v}"
  if command -v node >/dev/null 2>&1; then
    node -e "const [a1,a2,a3] = '$v1'.split('.').map(Number); const [b1,b2,b3] = '$v2'.split('.').map(Number); if (a1!==b1) process.exit(a1>b1?0:1); if (a2!==b2) process.exit(a2>b2?0:1); process.exit(a3>b3?0:1)"
  else
    [ "$v1" != "$v2" ] && [ "$(printf '%s\n' "$v2" "$v1" | sort -V | tail -n 1)" = "$v1" ]
  fi
}

download_latest_github_release() {
  local pkg_file="$1"
  local repo_url="$2"
  local destination="$3"
  read_github_token
  local repository
  repository="$(get_github_repository "$repo_url")"
  local api_url="https://api.github.com/repos/$repository/releases/latest"
  local auth_header=()
  if [ -n "$GITHUB_TOKEN" ]; then
    auth_header=(-H "Authorization: Bearer $GITHUB_TOKEN")
  fi

  local release_json
  release_json="$(curl -sSL -H "Accept: application/vnd.github+json" -H "User-Agent: lsby-electron-manual-updater" -H "X-GitHub-Api-Version: 2022-11-28" "${auth_header[@]}" "$api_url")"

  local architecture
  architecture="$(get_architecture)"
  local target_pattern="-electron-.*-darwin-${architecture}\.zip"

  local parse_script='
const data = JSON.parse(process.argv[1]);
const pattern = new RegExp(process.argv[2]);
const asset = (data.assets || []).find(a => pattern.test(a.name));
if (!asset) {
  process.exit(2);
}
console.log(asset.url || asset.browser_download_url);
console.log(asset.name);
console.log(asset.digest || "");
console.log(data.tag_name || "");
'
  local asset_info
  if command -v node >/dev/null 2>&1; then
    asset_info="$(node -e "$parse_script" "$release_json" "$target_pattern" || true)"
  elif command -v python3 >/dev/null 2>&1; then
    asset_info="$(python3 -c "
import json, re, sys
data = json.loads(sys.argv[1])
pattern = re.compile(sys.argv[2])
asset = next((a for a in data.get('assets', []) if pattern.search(a.get('name', ''))), None)
if not asset:
    sys.exit(2)
print(asset.get('url') or asset.get('browser_download_url'))
print(asset.get('name'))
print(asset.get('digest', ''))
print(data.get('tag_name', ''))
" "$release_json" "$target_pattern" || true)"
  else
    log_error "需要 node 或 python3 来解析 GitHub Release 信息"
    exit 1
  fi

  if [ -z "$asset_info" ]; then
    log_error "最新 Release 中没有找到 darwin-$architecture Electron 完整便携 ZIP"
    exit 1
  fi

  local asset_url
  local asset_name
  local asset_digest
  local tag_name
  asset_url="$(echo "$asset_info" | sed -n '1p')"
  asset_name="$(echo "$asset_info" | sed -n '2p')"
  asset_digest="$(echo "$asset_info" | sed -n '3p')"
  tag_name="$(echo "$asset_info" | sed -n '4p')"

  local current_version
  current_version="$(read_json_field "$pkg_file" "version")"
  local target_version="$tag_name"
  if [ -z "$target_version" ]; then
    target_version="$(echo "$asset_name" | sed -E -n 's/.*-electron-(.*?)-darwin-.*/\1/p')"
  fi

  if [ -n "$target_version" ] && [ -n "$current_version" ]; then
    if [ "$ALLOW_SAME_OR_DOWNGRADE" != true ]; then
      if ! version_gt "$target_version" "$current_version"; then
        log_info "当前已是最新版本 (v$current_version)，无需更新。"
        remove_safe_path "$STAGING_DIR"
        remove_safe_path "$WORK_DIR"
        exit 0
      fi
    fi
  fi

  if [[ "$asset_digest" =~ ^sha256:(.+) ]]; then
    DOWNLOAD_SHA256="${BASH_REMATCH[1]}"
  fi

  log_info "正在下载 GitHub Release Asset: $asset_name"
  curl -sSL -H "Accept: application/octet-stream" -H "User-Agent: lsby-electron-manual-updater" "${auth_header[@]}" "$asset_url" -o "$destination"
}

require_manual_sha256() {
  if [ -n "$DOWNLOAD_SHA256" ]; then
    return
  fi
  if [ "$NON_INTERACTIVE" = true ]; then
    log_error "使用 ZIP URL 或本地 ZIP 时必须指定 --sha256"
    exit 1
  fi
  read -r -p "请输入发布方提供的 ZIP SHA-256: " input_sha
  DOWNLOAD_SHA256="$(echo "$input_sha" | xargs)"
  if [ -z "$DOWNLOAD_SHA256" ]; then
    log_error "未提供 SHA-256，拒绝更新"
    exit 1
  fi
}

select_update_zip() {
  local pkg_file="$1"
  local destination="$2"

  if [ -n "$LOCAL_ZIP" ]; then
    require_manual_sha256
    cp "$LOCAL_ZIP" "$destination"
    return
  fi

  if [ -n "$ZIP_URL" ]; then
    require_manual_sha256
    download_file "$ZIP_URL" "$destination"
    return
  fi

  local default_repo
  default_repo="$(get_repository_url "$pkg_file")"

  if [ "$USE_DEFAULT_REPOSITORY" = true ]; then
    if [ -z "$default_repo" ]; then
      log_error "package.json 没有 repository，无法使用默认仓库"
      exit 1
    fi
    download_latest_github_release "$pkg_file" "$default_repo" "$destination"
    return
  fi

  if [ "$NON_INTERACTIVE" = true ]; then
    log_error "非交互模式必须指定 --local-zip、--zip-url 或 --default-repo"
    exit 1
  fi

  echo ""
  if [ -n "$default_repo" ]; then
    echo "1. 使用默认 GitHub 仓库最新 Release: $default_repo"
  fi
  echo "2. 输入其他 GitHub 仓库地址"
  echo "3. 输入 ZIP 下载地址"
  echo "4. 使用本地 ZIP 文件"
  read -r -p "请选择更新来源: " choice

  case "$choice" in
    1)
      if [ -z "$default_repo" ]; then
        log_error "package.json 没有 repository"
        exit 1
      fi
      download_latest_github_release "$pkg_file" "$default_repo" "$destination"
      ;;
    2)
      read -r -p "GitHub 仓库地址: " input_repo
      download_latest_github_release "$pkg_file" "$input_repo" "$destination"
      ;;
    3)
      require_manual_sha256
      read -r -p "ZIP 下载地址: " input_url
      download_file "$input_url" "$destination"
      ;;
    4)
      require_manual_sha256
      read -r -p "本地 ZIP 路径: " input_path
      cp "$input_path" "$destination"
      ;;
    *)
      log_error "无效选择"
      exit 1
      ;;
  esac
}

assert_zip_sha256() {
  local zip_file="$1"
  if [ -z "$DOWNLOAD_SHA256" ]; then
    require_manual_sha256
  fi
  local expected
  expected="$(echo "$DOWNLOAD_SHA256" | sed -e 's/^sha256://' | tr '[:upper:]' '[:lower:]' | xargs)"
  local actual
  actual="$(shasum -a 256 "$zip_file" | awk '{print $1}' | tr '[:upper:]' '[:lower:]')"
  log_info "更新包 SHA-256: $actual"
  if [ "$actual" != "$expected" ]; then
    log_error "更新包 SHA-256 校验失败 (预期: $expected, 实际: $actual)"
    exit 1
  fi
}

expand_validated_zip() {
  local zip_file="$1"
  log_info "正在解压更新包..."
  if command -v ditto >/dev/null 2>&1; then
    ditto -x -k "$zip_file" "$STAGING_DIR"
  else
    unzip -q -o "$zip_file" -d "$STAGING_DIR"
  fi

  local staged_app="$STAGING_DIR/lsby-playground-ts-service.app"
  local staged_pkg="$staged_app/Contents/Resources/app/package.json"
  local staged_bin="$staged_app/Contents/MacOS/lsby-playground-ts-service"

  if [ ! -f "$staged_pkg" ]; then
    log_error "ZIP 缺少 $staged_pkg"
    exit 1
  fi
  if [ ! -f "$staged_bin" ]; then
    log_error "ZIP 缺少 $staged_bin"
    exit 1
  fi

  local staged_migrations="$staged_app/Contents/Resources/app/prisma/migrations"
  if [ -d "$staged_migrations" ] && [ "$(ls -A "$staged_migrations" 2>/dev/null)" ]; then
    local prisma_cli="$staged_app/Contents/Resources/app/node_modules/prisma/build/index.js"
    local prisma_config="$staged_app/Contents/Resources/app/prisma.config.ts"
    if [ ! -f "$prisma_cli" ]; then
      log_error "ZIP 缺少 Prisma CLI: $prisma_cli"
      exit 1
    fi
    if [ ! -f "$prisma_config" ]; then
      log_error "ZIP 缺少 prisma.config.ts: $prisma_config"
      exit 1
    fi
  fi
}

assert_package_identity() {
  local current_pkg="$1"
  local new_pkg="$2"
  local cur_name
  local new_name
  local cur_ver
  local new_ver
  cur_name="$(read_json_field "$current_pkg" "name")"
  new_name="$(read_json_field "$new_pkg" "name")"
  cur_ver="$(read_json_field "$current_pkg" "version")"
  new_ver="$(read_json_field "$new_pkg" "version")"

  if [ "$cur_name" != "$new_name" ]; then
    log_error "更新包的项目名称 ($new_name) 与当前程序 ($cur_name) 不一致"
    exit 1
  fi

  if [ "$ALLOW_SAME_OR_DOWNGRADE" != true ]; then
    if ! version_gt "$new_ver" "$cur_ver"; then
      log_info "目标版本 (v$new_ver) 不高于当前版本 (v$cur_ver)，无需更新。"
      remove_safe_path "$STAGING_DIR"
      remove_safe_path "$WORK_DIR"
      exit 0
    fi
  fi
}

invoke_prisma() {
  local staged_app="$1"
  shift
  local app_resources="$staged_app/Contents/Resources/app"
  local macos_dir="$staged_app/Contents/MacOS"
  local electron_bin="$macos_dir/lsby-playground-ts-service-bin"
  if [ ! -f "$electron_bin" ]; then
    electron_bin="$macos_dir/lsby-playground-ts-service"
  fi
  local prisma_cli="$app_resources/node_modules/prisma/build/index.js"
  local prisma_config="$app_resources/prisma.config.ts"

  ELECTRON_RUN_AS_NODE=1 \
  DB_PATH_PRISMA="file:$DB_DIR/prod-electron.db" \
  NODE_PATH="$app_resources/node_modules" \
  "$electron_bin" "$prisma_cli" "$@" --config "$prisma_config"
}

restore_previous_version() {
  log_info "正在恢复更新前状态..."
  if [ -d "$PREVIOUS_ROOT_DIR" ]; then
    for item in "$PREVIOUS_ROOT_DIR"/*; do
      if [ -e "$item" ] || [ -L "$item" ]; then
        local base_item
        base_item="$(basename "$item")"
        remove_safe_path "$ROOT/$base_item"
        mv "$item" "$ROOT/"
      fi
    done
  fi

  if [ -f "$PREVIOUS_ROOT_MANIFEST" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      local name
      name="$(echo "$line" | xargs)"
      if [ -n "$name" ] && [ "$name" != "data" ]; then
        if [ ! -e "$PREVIOUS_ROOT_DIR/$name" ] && [ -e "$ROOT/$name" ]; then
          remove_safe_path "$ROOT/$name"
        fi
      fi
    done < "$PREVIOUS_ROOT_MANIFEST"
  fi

  if [ -d "$DB_BACKUP_DIR" ]; then
    remove_safe_path "$DB_DIR"
    cp -R "$DB_BACKUP_DIR" "$DB_DIR"
  fi

  if [ -f "$MARKER_PATH" ]; then
    rm -f "$MARKER_PATH"
  fi
  remove_safe_path "$STAGING_DIR"
  remove_safe_path "$WORK_DIR"
  log_info "旧版本和数据库已经恢复。"
}

cleanup_on_error() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    log_error "更新失败 (退出码: $exit_code)"
    if [ -f "$MARKER_PATH" ]; then
      restore_previous_version || log_error "自动恢复失败"
    else
      remove_safe_path "$STAGING_DIR"
      remove_safe_path "$WORK_DIR"
    fi
  fi
  exit $exit_code
}

trap cleanup_on_error EXIT

mkdir -p "$DATA_DIR"
mkdir -p "$BACKUPS_DIR"

if [ -f "$MARKER_PATH" ]; then
  log_info "检测到上次更新被中断。"
  restore_previous_version
  if [ "$NON_INTERACTIVE" != true ]; then
    read -r -p "是否继续开始一次新更新? (y/N): " continue_update
    if [ "$continue_update" != "y" ] && [ "$continue_update" != "Y" ]; then
      exit 0
    fi
  fi
fi

if pgrep -f "$APP_PROCESS_NAME" >/dev/null 2>&1; then
  log_error "应用仍在运行，请完全退出后再更新"
  exit 1
fi

if [ ! -f "$PACKAGE_PATH" ]; then
  log_error "应用缺少 package.json: $PACKAGE_PATH"
  exit 1
fi

remove_safe_path "$STAGING_DIR"
remove_safe_path "$WORK_DIR"
mkdir -p "$STAGING_DIR"
mkdir -p "$WORK_DIR"

DOWNLOAD_PATH="$WORK_DIR/update.zip"
select_update_zip "$PACKAGE_PATH" "$DOWNLOAD_PATH"
assert_zip_sha256 "$DOWNLOAD_PATH"
expand_validated_zip "$DOWNLOAD_PATH"

STAGED_APP_DIR="$STAGING_DIR/lsby-playground-ts-service.app"
NEW_PACKAGE_PATH="$STAGED_APP_DIR/Contents/Resources/app/package.json"
assert_package_identity "$PACKAGE_PATH" "$NEW_PACKAGE_PATH"

if [ -d "$DB_DIR" ]; then
  cp -R "$DB_DIR" "$DB_BACKUP_DIR"
fi

date -u +"%Y-%m-%dT%H:%M:%SZ" > "$MARKER_PATH"

STAGED_MIGRATIONS_DIR="$STAGED_APP_DIR/Contents/Resources/app/prisma/migrations"
if [ -d "$STAGED_MIGRATIONS_DIR" ] && [ "$(ls -A "$STAGED_MIGRATIONS_DIR" 2>/dev/null)" ]; then
  FIRST_MIGRATION="$(ls -1 "$STAGED_MIGRATIONS_DIR" | sort | head -n 1)"
  NEW_BASELINE="$(read_json_field "$NEW_PACKAGE_PATH" "prismaMigrationBaseline")"
  OLD_BASELINE="$(read_json_field "$PACKAGE_PATH" "prismaMigrationBaseline")"

  if [ -n "$NEW_BASELINE" ] && [ "$NEW_BASELINE" != "$FIRST_MIGRATION" ]; then
    log_error "新程序的 package.json 基线 ($NEW_BASELINE) 与首个 Prisma migration ($FIRST_MIGRATION) 不一致"
    exit 1
  fi

  if [ -z "$OLD_BASELINE" ]; then
    log_info "检测到首次引入 Prisma migrations，正在建立迁移基线..."
    invoke_prisma "$STAGED_APP_DIR" migrate resolve --applied "$FIRST_MIGRATION"
  fi

  log_info "正在执行 Prisma migrations..."
  invoke_prisma "$STAGED_APP_DIR" migrate deploy
else
  log_info "更新包没有 Prisma migrations，跳过数据库迁移。"
fi

mkdir -p "$PREVIOUS_ROOT_DIR"
> "$PREVIOUS_ROOT_MANIFEST"

for entry in "$ROOT"/*; do
  if [ -e "$entry" ] || [ -L "$entry" ]; then
    base_name="$(basename "$entry")"
    if [ "$base_name" != "data" ]; then
      echo "$base_name" >> "$PREVIOUS_ROOT_MANIFEST"
      mv "$entry" "$PREVIOUS_ROOT_DIR/"
    fi
  fi
done

for entry in "$STAGING_DIR"/*; do
  if [ -e "$entry" ] || [ -L "$entry" ]; then
    base_name="$(basename "$entry")"
    if [ "$base_name" != "data" ]; then
      mv "$entry" "$ROOT/"
    fi
  fi
done

if [ -d "$ROOT/lsby-playground-ts-service.app" ]; then
  chmod -R +x "$ROOT/lsby-playground-ts-service.app/Contents/MacOS" 2>/dev/null || true
  xattr -dr com.apple.quarantine "$ROOT/lsby-playground-ts-service.app" 2>/dev/null || true
fi
if [ -f "$ROOT/update.command" ]; then
  chmod +x "$ROOT/update.command" 2>/dev/null || true
fi
if [ -f "$ROOT/scripts/update.sh" ]; then
  chmod +x "$ROOT/scripts/update.sh" 2>/dev/null || true
fi

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
if [ -d "$DB_BACKUP_DIR" ]; then
  cp -R "$DB_BACKUP_DIR" "$BACKUPS_DIR/before-update-$TIMESTAMP"
fi

rm -f "$MARKER_PATH"
remove_safe_path "$STAGING_DIR"
remove_safe_path "$WORK_DIR"

log_info "✅ 更新成功！现在可以启动新版本。"
trap - EXIT
exit 0
