# 纯前端网站发布

网站可以发布到阿里云 OSS、GitHub Pages，或同时发布到两个平台。运行常用命令 `npm run release:all` 选择新版本，工具通过 bumpp 更新版本号，完成单元测试和构建，再提交、创建版本标签并推送当前版本。标签推送触发网站 CI，普通提交和 PR 只运行检查。

## 平台与公共路径

正式配置位于 `.env/.env.publish.web`。`ENABLE_OSS`、`ENABLE_GITHUB_PAGES` 分别控制平台开关，值为 `true` 或 `false`；`OSS_PUBLIC_PATH`、`PAGES_PUBLIC_PATH` 指定各平台的资源公共路径，必须以 `/` 开始和结束，例如 `/my-app/`。域名主页使用 `/`，GitHub Pages 项目网站通常使用 `/<仓库名>/`。

内部任务 `npm run task -- build:web:publish` 为所有启用的平台构建产物。公共路径相同时只构建一次，然后复制给两个平台；路径不同时分别构建。OSS 产物位于 `dist/web-publish/oss`，Pages 产物位于 `dist/web-publish/github-pages`。构建复用纯前端生产环境、代码生成与静态检查，页面、API Worker、SQLite Worker 和 WASM 由 Parcel 一起打包。

产物中的 `release-info.json` 记录真实 Git 提交与工作区状态，`website-build.json` 记录构建提交和公共路径。复用产物上传要求当前工作区干净、产物来自当前 HEAD 且公共路径匹配。生成或自动格式化若修改源码，应先提交再构建。

## OSS 发布

OSS 配置位于 `.env/.env.oss-aliyun`，包含 `OSS_REGION`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`OSS_BUCKET`、`OSS_PREFIX` 和 `OSS_ROOT_ALLOWED_DIRECTORIES`。未启用 OSS 时凭证字段可以显式留空；实际发布时凭证必须完整。子目录站点的 `OSS_PREFIX` 使用 `my-app/`，并与 `OSS_PUBLIC_PATH` 对应。

`OSS_PREFIX=""` 表示 Bucket 根站点。根站点只检查并上传本次产物的精确文件名，不列出整个 Bucket；产物中的一级目录必须在 `OSS_ROOT_ALLOWED_DIRECTORIES` 中明确授权，用逗号分隔，例如 `public,worker-assets,demo`。根站点禁止批量删除，其他产品目录不受影响。网站产物禁止符号链接、隐藏文件与特殊文件。

```bash
# 只构建 OSS 产物，不读取访问凭证、不连接云端
npm run task -- public:web:oss -- --build-only
# 复用产物，读取云端文件并展示同步计划
npm run task -- public:web:oss -- --upload-only
# 确认后上传
npm run task -- public:web:oss -- --upload-only --yes
```

不带 `--upload-only` 时先构建。上传按 MD5 比较文件，先更新资源，再更新 HTML；带内容哈希的资源使用长期缓存，其他文件使用 `no-cache`。默认保留旧资源，子目录站点可在检查计划后加 `--yes --delete` 清理该前缀下的旧文件。`--build-only` 必须单独使用。

## GitHub Pages 发布

```bash
npm run task -- public:web:github-pages -- --build-only
npm run task -- public:web:github-pages -- --upload-only
npm run task -- public:web:github-pages -- --upload-only --yes
```

本地命令通过 GitHub CLI 的现有登录触发当前版本标签的 CI，要求工作区干净且版本标签指向当前 HEAD。`--upload-only` 先核对本地已有产物，跳过本地构建；实际部署使用 CI 按同一版本构建并保存的产物。发布前需要已推送版本标签，且 GitHub CLI 已登录。

CI 使用 GitHub 官方 Pages artifact 与部署 action，直接部署 build 作业保存的产物，不重新构建。在仓库 Settings → Pages 中选择 GitHub Actions，并允许 `github-pages` 环境接受 `v*` 版本标签的部署。

## 版本 CI

将 `.github/workflows/deploy-pages.yml.example` 启用为 `.yml`。示例支持 `main`、`master` 的提交与 PR 检查，发布时要求 `v*` 标签与 `package.json` 版本完全一致。手动运行选择已有版本标签和 `all`、`oss`、`github-pages` 目标可重跑发布。

`check` 完成后运行 `build`，再分别执行 `publish-oss` 与 `publish-pages`；两个发布作业只依赖 `build`，其中一个失败不会阻止另一个。发布作业复用同一版本的构建产物；两个平台更新并非原子操作，失败后可单独重跑对应作业。

## 配置加密

正式环境文件均须显式填写全部字段。`CONFIG_ENCRYPTION` 选择明文或逐项加密，配置读取复用项目现有机制，OSS 凭证不会注入前端。写入真实凭证前可运行 `npm run task -- env:enable-encryption`；人工编辑加密配置使用 `env:decode`、`env:encode`。

GitHub Actions 通过 `PROJECT_CONFIG_KEY_FILE` Secret 恢复 `.project-config.key` 原文，可运行 `npm run task -- setup:github-config-key` 配置。工作流只在内存中读取解密配置，结束后清理密钥文件；密钥与 `.decode` 不得入库。
