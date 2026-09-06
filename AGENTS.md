# lsby-playground-ts-app 开发路牌

本文件同时面向开发者和 AI。它不重复解释源码，而是指出不同任务应先阅读的示例、实现入口和不可破坏的边界。

## 使用方式

- 修改代码前，先根据任务类型找到最接近的 demo，完整阅读相关前后端实现和测试，再沿用其结构。
- demo 用来展示标准写法；项目业务代码应写入 `src/interface/project/`、`src/web/components/project/` 等项目目录。除非任务本身是维护示例，否则不要把业务需求写进 demo。
- 优先复用现有接口逻辑、组件、管理器和任务，不要另造平行体系。
- 本文件只记录路牌和不变量。实现细节以当前源码、配置和类型检查结果为准；路径或行为变化时同步更新这里的路牌。

## 核心建模

接口层基于 `@lsby/net-core`，核心分层是：

1. 插件负责解析输入、注入能力和承载副作用。
2. 接口逻辑负责组合可复用的业务过程。
3. 返回器负责协议适配和输出。

请求参数、响应、错误、上下文和 WebSocket 消息都应处于类型契约内。同一份接口逻辑既可以作为 HTTP 接口运行，也可以在其他接口中直接调用。

最小完整示例：`src/interface/demo/base/add/index.ts`。内部复用示例：`src/interface/demo/base/sub/index.ts`。

## 项目入口

| 要找的内容         | 入口                                                 |
| ------------------ | ---------------------------------------------------- |
| Prisma Schema      | `prisma/schema.prisma`                               |
| API 接口           | `src/interface/`                                     |
| 可复用接口逻辑     | `src/interface-logic/`                               |
| Web Components     | `src/web/components/`                                |
| 前端页面           | `src/web/page/`                                      |
| 前端全局管理器     | `src/web/global/manager/`                            |
| 即时任务           | `src/job/instant-job/`、`src/model/job-instant/`     |
| 定时任务           | `src/job/scheduled-job/`、`src/model/job-scheduled/` |
| Electron 主进程    | `src/electron.ts`、`src/electron/`                   |
| CLI                | `src/cli.ts`                                         |
| 环境变量模型       | `src/global/env.ts`                                  |
| 应用路径与运行目标 | `src/app/app.ts`                                     |
| 任务定义           | `scripts/task/taskfile.ts`                           |

运行目标包括 Web、纯前端、Electron、SEA、Android 和 CLI。涉及跨环境路径、打包或运行差异时，必须先查看对应入口和 Taskfile，不要根据当前工作目录猜测。

## 后端接口路牌

新建项目业务接口放在 `src/interface/project/`。尽可能使用 POST 接口。

| 场景                                   | 先阅读                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------- |
| 最小 JSON 接口、返回类型、导出内调入口 | `src/interface/demo/base/add/index.ts`                                  |
| 带错误详情的返回                       | `src/interface/demo/base/div/index.ts`                                  |
| 调用另一个接口逻辑、组合登录能力       | `src/interface/demo/base/sub/index.ts`                                  |
| CRUD 与通用检查逻辑                    | `src/interface/demo/curd/user/`、`src/interface-logic/components/crud/` |
| 表单参数                               | `src/interface/demo/form/form-submit/index.ts`                          |
| 静态文件返回                           | `src/interface/demo/file/static-file/index.ts`                          |
| 动态文件返回                           | `src/interface/demo/file/dynamic-file/index.ts`                         |
| 流式文件返回                           | `src/interface/demo/file/stream-file/index.ts`                          |
| 多文件上传                             | `src/interface/demo/file/upload-file/index.ts`                          |
| WebSocket                              | `src/interface/demo/ws/ws-test/index.ts`                                |
| 回滚与清理                             | `src/interface/demo/logic-advanced/rollback-test/index.ts`              |
| 自定义 CORS 插件                       | `src/interface/demo/plugin-advanced/custom-cors/index.ts`               |
| 包装 Express 中间件                    | `src/interface/demo/plugin-advanced/express-middleware-wrap/index.ts`   |
| 递归或共享复杂类型                     | `src/interface/demo/plugin-advanced/custom-type-export/`                |
| 纯前端可运行接口                       | `src/interface/demo/pure/pure-string/index.ts`                          |
| Electron 能力接口                      | `src/interface/demo/electron/`                                          |

### 接口硬约束

- 不要用 `z.any()`、`any` 或不安全的 `as` 绕过接口契约。
- 递归或共享复杂类型参考 `custom-type-export`：类型放在独立 `types.ts`，通过 `NetCoreExportType` 导出；每个接口入口在本地声明严格的 `z.lazy()` Schema。
- 前端接口类型由生成器产生，不要手写重复的请求或响应类型。
- 需要旧数据或旧接口兼容时，不要自行加入兼容分支，先询问用户是否需要兼容。

## Web 前端路牌

前端使用项目自己的 Web Components 框架。组件基类位于 `src/web/base/base.ts`，演示页组装位于 `src/web/components/project/demo/demo.ts`。

| 场景                            | 先阅读                                               |
| ------------------------------- | ---------------------------------------------------- |
| 基础组件、输入框、API 调用      | `src/web/components/demo/add-demo.ts`                |
| 持有元素引用和本地状态          | `src/web/components/demo/todo-list-demo.ts`          |
| 表格、分页、表单、对话框和 CRUD | `src/web/components/demo/user-management-demo.ts`    |
| 文件选择、拖拽、FormData 上传   | `src/web/components/demo/file-upload/`               |
| WebSocket 推送                  | `src/web/components/demo/ws-demo.ts`                 |
| 对话框                          | `src/web/components/demo/dialog-demo.ts`             |
| Toast                           | `src/web/components/demo/toast-demo.ts`              |
| 页面跳转                        | `src/web/components/demo/to-demo.ts`                 |
| Electron                        | `src/web/components/demo/electron-demo.ts`           |
| Capacitor                       | `src/web/components/demo/capacitor-demo.ts`          |
| 获取生成的接口类型              | `src/web/components/demo/get-interface-type-demo.ts` |
| 登录与注册表单                  | `src/web/components/project/login/login.ts`          |
| 系统设置表单                    | `src/web/components/project/user/settings.ts`        |

通用组件优先从以下位置复用：

- 基础组件：`src/web/components/general/base/`
- 表单组件：`src/web/components/general/form/`
- 表格：`src/web/components/general/table/`
- 标签页：`src/web/components/general/tabs/`
- 流程组件：`src/web/components/process/`

### 前端硬约束

- 请求后端统一使用 `src/web/global/manager/api-manager.ts`，不得强制转换返回类型。WebSocket 用法参考 `ws-demo.ts`。
- 标准元素使用 `src/web/global/tools/create-element.ts` 创建，自定义组件直接 `new`；把需要复用的元素保存为类成员，避免 `document.createElement` 和 DOM 查询。
- 优先使用 `onxxx` 属性，不要默认使用 `addEventListener` 长期持有回调。
- 组件注册名使用英文，文件名使用英文短横线；界面中不使用 emoji。
- 样式优先通过类型化的 `style` 属性设置，不使用 `cssText` 拼接。
- 支持暗色模式，颜色优先复用 `src/web/global/style/global.css` 中的变量。
- 滚动区域优先使用 `src/web/components/general/base/scroll-container.ts`。Shadow DOM 确需自行创建滚动元素时，使用 `src/web/global/style/scrollbar.ts`；不要在组件中复制滚动条样式。

## 数据库、环境与生成文件

### 数据库

- Schema：`prisma/schema.prisma`。
- 开发迁移入口：`scripts/db/push-dev.ts`；其他环境应用入口：`scripts/db/push-prod.ts`。
- 统一运行 `npm run task -- db:push:xxx`，禁止使用 `prisma db push`。
- 开发数据库通过 `prisma migrate dev` 创建或应用 migration；生产、测试、CI 和打包环境只应用已有 migrations，没有 migration 时必须失败。
- 模板不提交默认 migration。新项目首次运行 `npm run task -- db:push:dev:web` 后，必须提交生成的 `prisma/migrations`。
- Prisma 生成错误 SQL 时，修改生成的 `migration.sql` 后再通过对应任务应用；不要静默改写已经发布并执行的迁移。
- 数据库时间统一存 UTC。

### 环境变量与路径

- 所有环境变量由 `src/global/env.ts` 使用 Zod 严格校验，不提供业务兜底值。
- 业务代码不得直接读取 `process.env`，统一使用 `环境变量` 对象。
- 不要使用 `process.cwd()` 或向上搜索 `package.json` 推断项目根目录。按 `BUILD_TARGET` 和 `NODE_ENV` 显式计算路径，参考 `src/app/app.ts`。
- `.env/*.example` 和 `deploy/servers.example.json` 是公开示例，禁止放入真实密钥、密码或私钥；实际配置与 `.setup-state.json` 必须保持 Git 忽略。

### 派生源码

`npm run generate` 会更新数据库类型、接口列表和类型、Web 组件索引、纯前端 API 与 Schema、应用元信息。生成定义见 `scripts/task/taskfile.ts`。

这些派生文件属于源码，必须提交 Git；不要手动维护它们：

- `src/types/db.ts`
- `src/interface/interface-list.ts`
- `src/types/interface-type.ts`
- `src/web/components/index.ts`
- `src/web/local-api-list.ts`
- `src/web/local-schema.ts`
- `src/app/meta-info.ts`

## 工程流程路牌

### Taskfile

- 所有项目命令定义在 `scripts/task/taskfile.ts`，执行器位于 `scripts/task/`。
- 使用 `npm run task` 搜索任务，`npm run task -- --list` 查看公共任务，`npm run task -- <任务名> --dry-run` 查看执行计划。
- `package.json` 只保留高频薄别名。组合关系写在 Taskfile 的 `依赖` 和 `依赖方式` 中，不要在任务命令里再次调用 `npm run`、`pnpm run` 或组合任务。
- 叶子任务只完成自己的动作。只有输出互不覆盖时才能并行。
- `scripts/watch/watch.ts` 是通用监听执行器，不得与具体任务名或 Taskfile 机制耦合。

### 初始化

| 场景                   | 入口                                                            |
| ---------------------- | --------------------------------------------------------------- |
| 首次安装向导           | `scripts/setup/preinstall.mjs`、`scripts/setup/postinstall.mjs` |
| 重新进入向导           | `npm run setup:init`                                            |
| 创建本地环境文件       | `scripts/setup/init-env.ts`                                     |
| 分配端口               | `scripts/setup/init-ports.ts`                                   |
| 重命名项目             | `scripts/setup/rename-project.ts`                               |
| Electron GitHub Secret | `scripts/setup/github-electron-env.ts`                          |

`preinstall` 发生在项目依赖可用之前，只能依赖 Node.js 内置模块，不能调用包管理器。初始化流程必须幂等、保留已有本地配置，并在 CI 或非交互环境跳过。任何输出都不得泄露 Secret 内容。

### 构建、纯前端与发布

- 构建、开发、测试和发布的组合关系以 `scripts/task/taskfile.ts` 为准；需要动态环境时使用 `--env <环境文件>`。
- 纯前端开发必须运行完整的 `dev:pure-frontend` 套件。运行链路入口为 `src/web/pure-frontend-api-worker.ts`、`src/web/local-sqlite-worker.ts` 和 `src/web/global/manager/api-manager.ts`。
- 纯前端数据存于浏览器本地，按 Origin 隔离，并通过 Web Locks 串行化多标签页数据库操作。登录、管理员和 JWT 不是服务端安全边界。
- 发布入口位于 `scripts/public/`；版本发布入口是 `scripts/release/release.ts`。
- `package.json` 的 `private: true` 是防止模板被意外发布的安全开关；确需发布 NPM 包时由项目维护者显式修改。
- 远程部署通用实现为 `scripts/public/release-docker-remote.ts`，服务器配置参考 `deploy/servers.example.json`。不要创建重复的项目专用部署框架。
- Docker 构建通过 BuildKit Secret 读取实际环境文件，禁止将秘密 `COPY` 进镜像。
- 远程 `redeploy` 会删除当前环境运行目录及其中的相对卷数据；`delete` 会删除整个远程项目目录。修改或执行相关流程前先确认数据生命周期和备份。

## 测试路牌

除非用户明确要求，否则不要主动新增测试。需要测试时优先沿用：

| 类型           | 示例与位置                                                    |
| -------------- | ------------------------------------------------------------- |
| 接口单元测试   | `src/interface/demo/base/add/t01.test.ts`                     |
| 接口多分支测试 | `src/interface/demo/base/sub/t01.test.ts`、`t02.test.ts`      |
| CRUD 测试      | `src/interface/demo/curd/user/*/t01.test.ts`                  |
| 上传测试       | `src/interface/demo/file/upload-file/t01.test.ts`             |
| 回滚测试       | `src/interface/demo/logic-advanced/rollback-test/t01.test.ts` |
| 集成测试       | `test/integration/demo.ts`                                    |
| 端到端测试     | `test/e2e/demo.spec.ts`                                       |
| E2E 演示模式   | `test/e2e/tools/demo-mode.ts`                                 |

- 单元测试与接口同目录；集成测试放在 `test/integration/`；端到端测试放在 `test/e2e/`。
- 测试运行期间通过接口两用性进行黑箱操作；准备数据和运行后验证可以直接使用数据库句柄。
- 测试数据库只应用已有迁移，不统一重置数据；每个测试负责自己的准备范围。
- `DEMO_MODE` 只控制 E2E 展示方式和速度，不得改变测试操作、断言或数据。

## 代码硬约束

- 默认编写 TypeScript。变量、函数、类和方法尽可能使用中文；文件名始终使用英文短横线。
- 始终使用 `let`，不使用 `var` 或 `const`；使用 `tsx`，不使用 `ts-node`；依赖安装优先使用 pnpm。
- 遵守 `no-floating-promises`、`explicit-function-return-type`、`explicit-member-accessibility`、`no-non-null-assertion`、`strict-boolean-expressions` 和 `no-negation`。
- 数组按下标访问时处理越界；条件显式比较 `true`、`false`、`null` 或 `undefined`。
- 类型优先使用 `type`，完整表达类型，避免 `any`、`unknown` 中转和不安全断言。
- Zod 校验和可能返回 `any` 的解析操作尽量直接内联到强类型调用中，不创建不安全的临时变量。
- 有穷联合类型使用穷尽 `switch`，不要用连续 `if`，也不要添加掩盖遗漏分支的 `default`。
- 不要用 `eslint-disable max-lines` 绕过行数检查，不要顺手删除已有注释、校验或断言。
- 中文命名已经能表达含义时，不写重复注释；在不影响可读性和逻辑的前提下保持实现简洁。
