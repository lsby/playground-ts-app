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

首次交互式安装会启动初始化向导。

依赖安装完成后，推荐在 VS Code 中按 `F1`，选择“运行任务”，然后启动：

- `运行web开发套件`
- `运行electron开发套件`
- `运行纯前端开发套件`

## 开发指南

项目只维护一份详细开发指南：[AGENTS.md](./AGENTS.md)。
