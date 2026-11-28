# 阿里云 OSS 与 GitHub Pages 发布

## 配置

OSS 发布只使用 `.env/.env.oss-aliyun`，不再读取 JSON 或独立示例文件。模板中保留全部字段，未配置的值显式写为空字符串：

```dotenv
CONFIG_ENCRYPTION=false
OSS_REGION=""
OSS_ACCESS_KEY_ID=""
OSS_ACCESS_KEY_SECRET=""
OSS_BUCKET=""
OSS_PREFIX=""
```

这些字段全部必填，上传或查看同步计划时遇到空值会直接报错。`OSS_PREFIX` 使用非空子目录，例如 `my-app/`；不允许 Bucket 根目录，不支持含空格或特殊字符的目录。

`CONFIG_ENCRYPTION` 自选明文或加密模式。脚本复用现有环境文件读取机制，加密时通过项目根目录的 `.project-config.key` 在内存中解密，不把 OSS 配置注入网页。需要加密时使用 `npm run task -- env:enable-encryption`；人工编辑已加密配置使用 `env:decode`、`env:encode`，完成后清理 `.decode`。项目密钥与 `.decode` 不得入库，配置是否加密由 `CONFIG_ENCRYPTION` 自主选择。

GitHub Actions 使用项目密钥时，唯一密钥 Secret 为 `PROJECT_CONFIG_KEY_FILE`，值为 `.project-config.key` 的完整原文；配置方式为 `npm run task -- setup:github-config-key`。工作流是否启用 OSS、发布标签与目标前缀由项目设置。

## 本地构建

只构建指定子目录的纯前端产物，不读取 OSS 凭证，也不连接 OSS：

```bash
npm run task -- public:oss:aliyun -- --build-only=my-app/
```

构建复用纯前端生产环境、派生文件生成与静态检查。页面、API Worker、SQLite Worker、WASM 等资源由 Parcel 一起打包，使用指定的公共路径，输出到 `dist/src/web`。

构建前后都按 `.env/.env.production.pure-frontend` 的 `DEPLOY_ALLOW_DIRTY_GIT` 检查 Git 状态；禁止 dirty 时遇到未提交修改就终止。成功后写入 `release-info.json`，记录实际 Git 提交和 dirty 状态，同时自动生成 `website-build.json`，记录构建公共路径与 Git 提交。这两个文件都是工具生成的产物，不需要手工配置。生成或自动格式化若改变了源码，应提交修改后重新构建。

## 查看计划与上传

默认重新构建，再通过 OSS 的只读列表接口比较文件，展示计划：

```bash
npm run task -- public:oss:aliyun
```

已经构建时可以复用产物，只查看同步计划：

```bash
npm run task -- public:oss:aliyun -- --upload-only
```

`--upload-only` 要求 `dist/src/web/index.html`、`release-info.json` 与 `website-build.json` 存在，两个信息文件的提交均等于当前 HEAD，且产物、工作区与暂存区均为干净状态。工具还会自动核对构建公共路径与本次 `OSS_PREFIX` 是否一致；信息缺失、格式错误或目标不匹配都会终止上传并要求重新构建。它不重新构建。

确认计划后，显式加 `--yes` 执行上传：

```bash
npm run task -- public:oss:aliyun -- --upload-only --yes
```

脚本按 MD5 比较文件，先上传全部变更资源，成功后再更新 HTML。带内容哈希的资源使用长期缓存，其余文件使用 `no-cache`。资源上传失败时不进入 HTML 上传阶段；多页面上传和跨站点发布仍可能部分完成，修复后可以重跑。

默认保留云端旧文件，让已打开的旧页面仍可加载旧资源。确需清理时检查列出的旧文件，显式加 `--yes --delete`；清理在资源与 HTML 全部上传成功后执行，只作用于配置的前缀。未加 `--yes` 时不会上传或删除。`--build-only` 不能与上传或删除参数同时使用。

## 两个站点共用产物

GitHub Pages 与 OSS 共用一次构建时，两站的公共路径必须一致。GitHub Pages 使用仓库名作为子目录时，`OSS_PREFIX` 也应设为同一仓库名加 `/`。将同一份 `dist/src/web` 发布到 Pages，再用 `--upload-only --yes` 上传 OSS，避免两次构建产生不同资源。

普通提交、PR、版本标签和手动重跑的触发规则写在项目工作流中。两个站点分别更新，发布期间可能短暂处于不同版本；失败时检查对应任务的日志并重跑。Pages 使用 `gh-pages` 分支托管时，在仓库 Settings → Pages 中选择该分支和根目录。
