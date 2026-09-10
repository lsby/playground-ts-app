# lsby-playground-ts-app

一个支持多种运行目标的全栈 TypeScript 项目模板。相同的接口与业务代码可以运行在 Node.js 服务端、浏览器 Worker、Electron 和 Node.js SEA 中。

接口层基于 [@lsby/net-core](https://github.com/lsby/net-core)：由类型契约约束输入、输出与错误，并让同一份业务逻辑可以通过 HTTP 调用或在内部复用。本模板在此基础上提供 Prisma/Kysely 数据库、Web Components 前端、多目标运行、测试与发布流程。

## 运行目标

| 目标     | 运行方式                         |
| -------- | -------------------------------- |
| Web      | Node.js 服务端与浏览器前端       |
| 纯前端   | 浏览器 Worker 与本地 WASM SQLite |
| Electron | Electron 主进程与 Web UI         |
| SEA      | Node.js 单文件可执行程序         |
| 移动端   | Capacitor 容器                   |
| CLI      | Node.js 命令行程序               |

## 快速开始

安装依赖：

```powershell
pnpm install
```

首次交互式安装会启动初始化向导，用于选择运行目标、创建本地配置、分配端口和重命名项目。选择初始化开发数据库后，安装完成时会自动执行 `db:push:dev:web`；跳过向导、选择不初始化、CI 或非交互安装均不会执行。

推荐在 VS Code 中按 `F1`，选择“运行任务”，然后启动：

- `运行web开发套件`
- `运行electron开发套件`
- `运行纯前端开发套件`

也可以直接运行：

```powershell
npm run dev:web
npm run dev:electron
npm run dev:pure-frontend
```

重新进入初始化向导：

```powershell
npm run setup:init
```

## 常用命令

| 命令                      | 用途                           |
| ------------------------- | ------------------------------ |
| `npm run task`            | 交互式搜索任务                 |
| `npm run task -- --list`  | 查看公开任务                   |
| `npm run generate`        | 更新全部派生源码               |
| `npm run check`           | 检查格式、ESLint 和 TypeScript |
| `npm run fix`             | 自动修复并格式化               |
| `npm run db:push:dev:web` | 创建或迁移开发数据库           |

## 开发指南

项目只维护一份详细开发指南：[AGENTS.md](./AGENTS.md)。
