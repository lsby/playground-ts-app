# 个人项目模板

## 快速开始

- 安装依赖: pnpm i
- 初始化数据库: npm run db:push:dev:web
- vscode中启动: F1 -> 运行任务 -> 运行web开发套件/运行electron开发套件

## Docker 远程部署

运行 `pnpm public:docker:remote`，按照交互提示选择服务器、环境和操作模式。服务器在 `scripts/public/release-docker-remote.ts` 顶部配置，其中 `deployRootDir` 表示部署根目录；未配置时使用远程用户的 `$HOME`。项目名取自 `package.json`，远程目录结构为：

```text
<部署根目录>/<项目名>/
├─ upload/
├─ build/<环境>/
└─ run/<环境>/
```

项目的部署定义放在 `deploy/development` 和 `deploy/production`。Compose 在 `run/<环境>/deploy/<环境>` 中执行，因此生产配置中的 `../../db:/opt/app/db` 会映射到 `run/production/db`，也正是通用脚本同步 SQLite 数据库的位置。

三种操作的数据生命周期不同：

- `run`：覆盖打包内容中的同名文件，不预先清空运行目录。
- `redeploy`：先删除整个 `run/<环境>`；其中的相对卷目录（如 `db`、`data`）也会删除，操作前应备份需要保留的数据。
- `delete`：删除 `<部署根目录>/<项目名>` 整体，并清理相关容器和镜像。

必须跨彻底重部署保留的大体积数据，可以使用宿主机绝对路径挂载到项目目录之外；这类目录不会由通用脚本自动备份、迁移或删除。Docker 与普通 Web 运行目标的环境变量语义不同时，应使用独立环境变量文件，不要在 Compose 中覆盖其他目标的 `BUILD_TARGET`。
