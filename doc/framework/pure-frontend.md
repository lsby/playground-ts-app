# 纯前端 (Pure Frontend) 架构与规范

## 核心组件

- UI 层面的请求转发以及处理跨标签页锁均由 `src/web/global/manager/api-manager.ts` 负责
- 后端业务逻辑以 API Worker 的形式运行在 `src/web/pure-frontend/pure-frontend-api-worker.ts` 中
- 底层数据存储依赖 SQLite Worker 并依托 IndexedDB 持久化, 相关实现在 `src/web/pure-frontend/local-sqlite-worker.ts`
- 对 Node 运行时的模拟实现在 `src/web/mock/` 目录中, 并通过 `package.json` 的 `browser` 与 `alias` 字段进行替换配置

## 生成与配置

- 构建系统会派生浏览器可用接口列表 `src/web/pure-frontend/local-api-list.ts`, 轻量路由策略 `src/web/pure-frontend/local-api-policy.ts`, 本地数据库 Schema `src/web/pure-frontend/local-schema.ts`, 以及迁移和主键元信息 `src/types/local-first-database-meta.ts`
- 并不是所有接口都自动进入浏览器环境, 只有明确带有 `{ 浏览器支持: '纯前端' | '本地优先' }` 声明的接口才会被生成器收录
  - `'纯前端'` 表示接口及依赖可以打包到浏览器, 仅在纯前端构建中本地执行
  - `'本地优先'` 是纯前端能力的超集, 在普通 Web 构建中也会基于用户的本地同步数据库执行
  - 可以参考 `src/interface/demo/auth/is-login/index.ts` 和 `src/interface/user/get-user-config/index.ts`

## 运行与并发

- 启动开发环境时, 必须运行完整的 `npm run task -- dev:pure-frontend` 任务, 这样才能同时监听本地 API 列表和 Schema 等派生文件的更新
- 为了保证并发安全, 在本地执行 API 调用或 DB 管理命令期间, 系统必须持有 Web Locks 的排他锁, 防止多标签页同时写入 IndexedDB 内的 SQLite 数据库
- 普通 Web 构建的本地优先同步同样持有该排他锁, 同步期间禁止执行本地接口
