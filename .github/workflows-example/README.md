# Electron Release CI 模板

将 `release-electron.yml` 复制到 `.github/workflows/release-electron.yml` 后启用。

推送 `v*` 标签时，工作流会构建并发布唯一的 Electron 完整便携 ZIP。该 ZIP 同时用于首次安装和后续更新；更新程序会保留现有 `data` 目录。

请先核对 `.env/.env.production.electron` 中的发布配置。不要将真实密钥提交到公开仓库；如需在 CI 中注入密钥，应改用 GitHub Actions Secrets。
