# 纯前端 (Pure Frontend) 架构与规范

## 定位

- 纯前端模式用于无需部署后端的场景: 页面和静态资源通过网络加载, 接口逻辑和数据库在浏览器内运行。
- 普通 Web 与纯前端模式都按有网络的环境使用, 不承诺离线可用, 不提供 Service Worker 或离线资源预缓存。
- 框架不提供本地与远程数据同步、冲突合并或多端一致性机制, 有此需求的项目自行实现。

## 核心组件

- `src/web/global/manager/api-manager.ts` 根据构建目标选择请求通道: 普通 Web 请求服务端, 纯前端请求 API Worker。
- Worker 通信及跨标签页写入锁由 `src/web/global/manager/pure-frontend-client.ts` 负责。
- 接口逻辑在 `src/web/pure-frontend/pure-frontend-api-worker.ts` 中执行, 使用本机 JWT 认证, 不依赖远程认证服务。
- SQLite Worker 位于 `src/web/pure-frontend/local-sqlite-worker.ts`, 数据依托 IndexedDB 持久化, 刷新页面后保留。
- 对 Node 运行时的模拟实现在 `src/web/mock/` 中, 通过 `package.json` 的 `browser` 与 `alias` 字段进行替换配置。

## 生成与配置

- 构建系统派生浏览器可用接口列表 `src/web/pure-frontend/local-api-list.ts` 和数据库迁移清单 `src/web/pure-frontend/local-schema.ts`。
- 只有明确声明 `{ 浏览器支持: '纯前端' }` 的接口才会被生成器收录, 表示接口及其依赖可以打包到浏览器; 普通 Web 中这些接口仍在服务端执行。
- 登录接口示例见 `src/interface/demo/auth/is-login/index.ts`, 用户配置示例见 `src/interface/user/get-user-config/index.ts`。
- 浏览器数据库执行 `prisma/migrations/` 中的迁移链, 通过 `_prisma_migrations` 记录和校验迁移, 迁移失败时明确报错。
- 仅纯前端构建会生成 API Worker 及 SQLite 资源, 普通 Web 构建不包含这些数据库运行资源。

## 运行与并发

- 开发时必须运行完整的 `npm run task -- dev:pure-frontend`, 同时监听本地 API 列表、数据库迁移清单和 Worker 的更新。
- 本地 API 调用和数据库管理命令必须持有 Web Locks 排他锁, 防止多标签页同时写入 IndexedDB 中的 SQLite 数据库。
- 登录和退出只处理认证状态, 不执行数据同步、快照替换或恢复操作。
