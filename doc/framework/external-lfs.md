# 外挂 LFS

外挂 LFS 用于同步不适合直接提交 Git、但构建和发布需要的私密文件。当前支持阿里云 OSS 和腾讯云 COS，并支持同时配置多个存储目标（多 OSS/COS 混合存储）。Git 保存明文配置和逐文件加密清单，云存储只保存逐文件加密后的对象；`.project-config.key` 是唯一解密根密钥，仍需通过 GitHub Actions Secret 和线下备份保管。

## 启用

复制 `.external-lfs/config.example.json` 为 `.external-lfs/config.json`，然后显式配置存储目标与管辖目录：

```json
{
  "version": 1,
  "credentialsFile": ".env/.env.external-lfs",
  "keyFile": ".project-config.key",
  "manifestDirectory": ".external-lfs/manifests",
  "targets": {
    "default-cos": {
      "provider": "tencent-cos",
      "remotePrefix": "my-project/private-files/v1",
      "env": {
        "region": "EXTERNAL_LFS_COS_REGION",
        "bucket": "EXTERNAL_LFS_COS_BUCKET",
        "secretId": "EXTERNAL_LFS_COS_SECRET_ID",
        "secretKey": "EXTERNAL_LFS_COS_SECRET_KEY"
      }
    },
    "backup-oss": {
      "provider": "aliyun-oss",
      "remotePrefix": "my-project/backup-files/v1",
      "env": {
        "region": "EXTERNAL_LFS_OSS_REGION",
        "endpoint": "EXTERNAL_LFS_OSS_ENDPOINT",
        "bucket": "EXTERNAL_LFS_OSS_BUCKET",
        "accessKeyId": "EXTERNAL_LFS_OSS_ACCESS_KEY_ID",
        "accessKeySecret": "EXTERNAL_LFS_OSS_ACCESS_KEY_SECRET"
      }
    }
  },
  "managedPaths": [{ "path": "doc/private", "scope": "private" }],
  "exclude": ["**/.DS_Store", "**/*.tmp", "**/.gitkeep"]
}
```

配置说明：

- `targets`：配置一个或多个命名的存储目标。每个目标指明 `provider`（`aliyun-oss` 或 `tencent-cos`）、云端独立前缀 `remotePrefix`，以及所绑定的环境变量名映射 `env`。
- `managedPaths`：需要同步的本地目录及其稳定 scope。
- `exclude`：管辖目录内不应上传的文件 glob。

`.external-lfs/config.json` 是项目配置，应提交 Git。未完成配置时命令会立即失败。

## 云存储凭据准备

创建私有 Bucket、开启版本控制，并把权限限制在 `remotePrefix`。工具上传后必须取得 `versionId`，否则立即失败；工具不会远程删除历史对象。

在 `.env/.env.external-lfs` 写入 `config.json` 中声明的各目标环境变量值，然后立即运行 `npm run task -- env:enable-encryption`（或 `env:encode`）加密：

```dotenv
CONFIG_ENCRYPTION=false

# 腾讯云 COS (default-cos)
EXTERNAL_LFS_COS_REGION=ap-guangzhou
EXTERNAL_LFS_COS_BUCKET=my-bucket-1250000000
EXTERNAL_LFS_COS_SECRET_ID=替换为SecretId
EXTERNAL_LFS_COS_SECRET_KEY=替换为SecretKey

# 阿里云 OSS (backup-oss)
EXTERNAL_LFS_OSS_REGION=oss-cn-hangzhou
EXTERNAL_LFS_OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
EXTERNAL_LFS_OSS_BUCKET=my-oss-bucket
EXTERNAL_LFS_OSS_ACCESS_KEY_ID=替换为AccessKeyId
EXTERNAL_LFS_OSS_ACCESS_KEY_SECRET=替换为AccessKeySecret
```

加密后的 `.env/.env.external-lfs` 应提交 Git，不得提交明文。日后修改凭据时使用现有的 `env:decode`、`env:encode` 流程。

## 安全边界与多目标路由

- 每次上传使用随机对象名，不覆盖旧对象；取消登记不会删除云端历史对象。
- 文件使用 AES-256-GCM 加密，每个对象和清单都使用随机盐，通过 HKDF 从 `.project-config.key` 派生独立密钥。
- 清单文件名是随机 UUID，文件的真实路径、SHA-256、归属存储目标（target）、云端 object key 和 versionId 都在加密清单内部。
- **多目标路由机制**：
  - 每个文件在清单中持久记录其归属的存储目标名称。
  - **新文件首次推送**：若配置了多个目标，必须显式通过 `--target <目标名称>`（或搭配 `--file <路径>`）指定；若只配置了一个目标，则自动使用该唯一目标。
  - **已有文件更新**：直接依据清单记录的目标上传，无需重复指定 `--target`。
  - **拉取与校验**：自动按每个文件清单中的存储目标连接对应的云凭据，支持全量一键同步或单文件精确拉取。

## 命令

```bash
# 查看所有加密清单中的真实文件列表、大小、归属目标及本地状态
npm run task -- external-lfs:list

# 比较管辖文件、加密清单和云存储对象状态
npm run task -- external-lfs:status

# 加密并上传
npm run task -- external-lfs:push

# 按清单拉取并解密
npm run task -- external-lfs:pull

# 下载并三层校验全部对象
npm run task -- external-lfs:verify
```

### 命令选项

- `--file <路径或模式>` / `--pattern <模式>`：支持**单个具体文件**、**目录路径**或 **Glob 通配符**（如 `doc/private/*.p12`、`certs/`、`*.bin`），作用于 `list`、`push`、`pull`、`status` 或 `verify`。
- `--target <目标名称>`：指定目标（用于过滤，或在多目标环境下首次 push 新文件时指定目标）。
- `--scope <名称>`：按配置的 scope 过滤操作范围。
- `--yes` / `-y`：（仅 push）跳过推送前的交互式二次确认。非交互式环境（如 CI/CD）必须显式传入此参数。
- `--accept-deletions`：（仅 push）人工确认删除本地已登记文件，将对应清单从 Git 记录中移除（远端历史对象不删除）。
- `--exact`：（仅 pull）精确同步，拉取前把冲突的本地文件以及多余的未登记文件移动到 `.external-lfs/recovery/` 暂存区。

### 推送二次确认机制

使用 Glob 通配符、目录或批量推送时，为防止意外上传非预期文件，`push` 命令在实际开始加密上传前会列出即将执行的文件清单（包含类型、归属目标、文件大小），并在终端要求输入 `y` 或 `yes` 进行二次确认；若未确认或传入否定输入则安全退出。若在自动化脚本或 CI 环境中执行，可通过 `--yes`（或 `-y`）参数跳过交互式二次确认。

## 提交保护

提交钩子会识别暂存区中的疑似二进制内容，并在放行前要求二次确认。此类文件原则上不应直接写入 Git；确有存储需求时，应优先纳入扩展 LFS，或采用其他合适的外部存储方案。
