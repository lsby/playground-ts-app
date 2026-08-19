# lsby-playground-ts-app AI 编码指南

## 架构概览

这是一个具有多个部署目标的全栈 TypeScript 应用程序:

- **Web 服务器**: Express-like 服务器
- **纯前端应用**: 后端逻辑与数据库打包至浏览器 Worker 本地运行的应用
- **桌面应用**: 使用 Electron 编译的桌面应用
- **安卓应用**: 使用 Capacitor 编译的安卓应用
- **命令行应用**: 命令行应用

## 项目架构

1. **数据库层**

- 使用 Prisma + Kysely 管理数据库
- Schema 定义在 `prisma/schema.prisma`
- 应用 Prisma 时会生成 Kysely 使用的类型: `src/types/db.ts`
- 总是使用 `npm run db:push:xxx` 生成迁移。如果迁移失败（如 Prisma 生成了错误的 SQL），直接手动去生成的 migration 文件夹中修改 `.sql` 文件，修改完成后再次运行 `npm run db:push:xxx` 重新应用即可。
- 不要使用 `prisma db push`, 因为它会调整数据库但不生成迁移文件, 产生脱节

2. **接口层**

- 接口: `src/interface/`
  - 接口示例: `src/interface/demo`
  - 项目相关接口请写到: `src/interface/project`
- 通用接口抽象: `src/interface-logic`
- 系统会自动生成接口列表: `src/interface/interface-list.ts`
- 系统会自动生成接口类型: `src/types/interface-type.ts`
- 接口可以在内部被调用, 参考 `src/interface/demo/base/sub/index.ts` 对 `src/interface/demo/base/add/index.ts` 的调用

3. **任务系统**

- 即时任务: `src/job/instant-job/`
  - 抽象类: `src/model/instant-job/instant-job.ts`
  - 管理器: `src/model/instant-job/instant-job-manager.ts`
  - 支持优先级、重试机制和并发控制
- 定时任务: `src/job/scheduled-job/`
  - 抽象类: `src/model/scheduled-job/scheduled-job.ts`
  - 管理器: `src/model/scheduled-job/scheduled-job-manager.ts`
  - 使用cron表达式进行调度

4. **Web 前端**

- 前端代码: `src/web/`
- 前端使用自封装的 Web Components 框架: `src/web/base/base.ts`
- 前端组件: `src/web/components`
  - 示例组件: `src/web/components/demo`
  - 通用组件: `src/web/components/general`
  - 基础通用组件: `src/web/components/general/base`
  - 基础表单组件: `src/web/components/general/form`
  - 流程控制: `src/web/components/process`
  - 项目组件: `src/web/components/project`
- 前端全局样式: `src/web/global/style`
- 前端全局管理器: `src/web/global/manager`
  - 包含提示框管理器, 对话框管理器, 吐司消息管理器, API 管理器, 日志管理器等
- 前端页面入口: `src/web/page`
  - 包含多个 html 入口, 每个 html 文件对应一个 url
  - 演示页面: `src/web/page/demo.html`
- 系统会自动生成组件列表: `src/web/components/index.ts`
- 请求后端请使用 API管理器(`src/web/global/manager/api-manager.ts`), 它会自动推断接口的参数和返回类型, 严禁将返回值通过`as`强制类型转换

4. **Electron应用**

- 主进程入口: `src/electron.ts`
- 相关功能函数和类型: `src/electron`

5. **CLI应用**

- 命令行入口: `src/cli.ts`

## 开发工作流

### 初始化与配置命令 (Setup)

在基于本模板新建项目或进行初始化配置时，提供了以下 setup 命令：

1. **端口分配与初始化 (`pnpm setup:ports`)**:
   - 运行脚本: `scripts/setup/init-ports.ts`
   - 作用: 自动扫描并分配一组随机空闲端口（包括 `APP_PORT`、`WEB_PORT`、`WEB_HMR_PORT`、`TEST_APP_PORT`、`TEST_WEB_PORT`、`TEST_WEB_HMR_PORT`），并批量同步更新至所有环境的 `.env` 配置文件（开发、生产、纯前端、测试等）以及 Docker 部署配置文件（`docker-compose.yml`、`dockerfile`）中，彻底解除硬编码并避免多项目本地端口冲突。

2. **项目全局重命名 (`pnpm setup:rename`)**:
   - 运行脚本: `scripts/setup/rename-project.ts`
   - 作用: 交互式项目重命名工具。通过命令行交互提示输入新的作者名和项目名，自动将项目内所有出现的作者与项目名变体（包括 `@作者/项目名`、`@作者:项目名`、`作者.项目.名`、`作者-项目名`）在所有文本文件中进行全局批量替换，并自动跳过构建产物与依赖目录。

### 项目约定

1. **API接口定义**

- 尽可能写 post 接口而不是 get 接口
- **递归/共享类型定义与导出**:
  - 由于后端生成器 (基于 AST 解析) 无法跨文件深入解析 `z.lazy` 等复杂递归 Zod Schema，当接口需要返回或接收复杂的递归类型时，请遵循以下规范：
    1. **使用专用文件导出类型**: 将 TypeScript 类型定义在单独的 `types.ts` 文件中，并通过 `@lsby/net-core` 的 `NetCoreExportType<'TypeName', Type>` 暴露给系统，这会自动将此 TS 类型写入生成的前端 `interface-type.ts` 中。(参考示例: `src/interface/demo/plugin-advanced/custom-type-export/types.ts`)
    2. **本地声明 Zod Schema**: 在每个使用该类型的 API 接口文件 (`index.ts`) 内，**本地重新声明**该递归类型的 `z.lazy()` Schema。通过这种方式，既能让生成器正常工作，也能保持入口的严格类型校验。严禁在 API 响应结构中使用 `z.any()` 逃避检查。(参考示例: `src/interface/demo/plugin-advanced/custom-type-export/index.ts`)

2. **Web组件开发**

- 组件的注册名不要使用中文
- 前端代码及界面中不要使用 emoji
- 尽可能复用通用组件: `src/web/components/general`, 便于统一样式和行为
  - 尽可能复用基础通用组件: `src/web/components/general/base`, 便于统一样式和行为
  - 尽可能复用基础表单组件: `src/web/components/general/form`, 便于统一样式和行为
- 尽可能使用工厂函数创建元素: `src/web/global/tools/create-element.ts`
- 不要直接使用 `document.createElement`（会丢失类型信息），也**极力避免使用 DOM 查询**（如 `querySelector`），而是将组件作为类`new`出来, 或使用`创建元素`工厂函数。
- **获取对象引用的正确做法**：将元素直接作为类的成员变量实例化，从而天生持有引用。
  - 标准元素使用工厂函数：`private 结果 = 创建元素('p')`
  - 自定义组件直接 `new` 出来：`private 按钮 = new 主要按钮({ ... })`
  - 然后在 `当加载时()` 等生命周期中追加：`this.shadow.append(this.结果)`
- 支持黑暗模式: `src/web/global/style/global.css` 内定义了相关 css 变量
- 使用 `src/web/global/api-manager.ts` 来请求后端
  这是一个包装过的http请求, 第三个参数是一个回调, 可以直接获得后端 ws 的推送信息
  参考 `src/web/components/demo/ws-demo.ts`

3. **环境变量与多环境架构**

- **环境变量规范**:
  - 全局环境变量受到 `zod` 的严格校验，位于 `src/global/env.ts`。其中最核心的三个维度是：
    1. `NODE_ENV`: 运行环境 (`development`, `production`, `test`)。
    2. `BUILD_TARGET`: 编译目标 (`web`, `electron`, `sea`, `pure-frontend`)。
    3. `LOCAL_MODE`: 是否为本地免登录模式 (布尔值)。
  - **绝不提供兜底默认值** (Fail-Fast 原则)。所有依赖的环境变量必须在启动或打包前通过 `ENV_FILE_PATH` 指定的 `.env` 文件提供，缺少即报错。
  - **绝不允许在业务代码（无论是前端还是后端）中直接使用 `process.env['XXX']`**。总是导入 `src/global/env.ts` 中的 `环境变量` 对象以获得类型提示和严格校验。前端打包时（Parcel），系统会通过 `src/web/mock/env-provider-mock.ts` 将环境变量在编译时静态注入。

- **多环境路径解析**:
  - **绝对禁止使用 `process.cwd()` 或简单的 `__dirname` 配合不断向上查找 `package.json` 的方式来获取项目根目录**。由于本项目包含多个构建目标，不同环境下运行的起始目录及打包后的产物结构（如 `.sea`）存在显著差异。
  - **必须基于 `BUILD_TARGET` 和 `NODE_ENV` 进行静态路径计算**。获取绝对路径时，参考 `src/app/app.ts` 中的做法，通过 `switch (环境变量.BUILD_TARGET)` 结合 `NODE_ENV` 为每个特定的部署目标明确指定 `path.resolve` 逻辑。

4. **纯前端模式 (Pure Frontend Architecture)**

本项目支持将后端逻辑和数据库完全打包到浏览器中独立运行，无需依赖任何真实服务端。当 `BUILD_TARGET='pure-frontend'` 时，系统采用三层架构运行：

- **Tier 1 (UI 主线程)**: 负责渲染页面UI。传统的 HTTP 请求会被 `src/web/global/manager/api-manager.ts` 自动拦截，转换为基于 `MessageChannel` 的 Web Worker 通信，转发给 API Worker。
- **Tier 2 (API Worker)**: 位于 `src/web/pure-frontend-api-worker.ts`。在此处加载原本跑在后端的业务逻辑与接口代码。为了让 Node.js 代码能在浏览器运行，打包器会根据 `package.json` 中的 `alias` 配置，借助 `src/web/mock/` 目录将 `fs`、`crypto`、`express` 等核心库 Mock 掉。
- **Tier 3 (DB Worker)**: 位于 `src/web/local-sqlite-worker.ts`。在独立的 Worker 中基于 WebAssembly (WASM) 运行 SQLite，并通过 IndexedDB 进行浏览器本地持久化。当前明确使用 `useIdbStorage`，不依赖 OPFS 的 `FileSystemSyncAccessHandle`，也不使用 SharedArrayBuffer。
- **多标签页并发安全**: 为防止多个浏览器标签页同时操作本地 SQLite，UI 主线程会在每次本地 API 请求或数据库管理命令的完整执行期间，通过 Web Locks API (`navigator.locks.request('lsby-pure-frontend:local.db')`) 持有跨标签页排他锁。其他标签页的请求会等待当前请求释放锁；Worker 本身是每个标签页按需创建并长期存活的，不存在“只有一个标签页可以初始化 Worker”的限制。
- **构建与生成**: 开发时必须使用 `运行纯前端开发套件`，因为它会独占性地启动 `_持续生成纯前端本地API列表` 这类专属任务；纯前端的构建命令同样需要严格配合专有的 `.env.xxx.pure-frontend` 配置文件使用。

5. **其他**

- 使用 pnpm 安装依赖

## 重要文件参考

- `prisma/schema.prisma`: 数据库模型定义
- `src/types/interface-type.ts`: 自动生成的后端接口类型

## 代码风格

- 对于支持的语言, 变量名, 函数名, 类名, 方法名等, 都尽可能使用中文(没错, 是中文), 但文件名总是使用英文
- 除非指定, 否则默认为ts代码
- 对于变量名, 函数名, 类名, 方法名等, 都尽可能使用中文(没错, 是中文), 但文件名总是使用英文
- 使用tsx直接运行ts代码, 而不是ts-node
- 尽可能使用pnpm而不是npm或yarn
- 禁止浮动的 Promise: no-floating-promises, 谨慎使用 void 忽略悬空的 promise
- 必须写函数返回类型: explicit-function-return-type
- 必须写类成员访问修饰符: explicit-member-accessibility
- 禁止非空断言: ! → no-non-null-assertion
- 永远使用 let, 拒绝 var 和 const
- 条件里必须显式布尔值: strict-boolean-expressions
- 禁止对非布尔值取反: no-negation
- 总是考虑数组通过下标取项时可能出现的越界问题, 并做安全检查
- 总是使用严格的条件判断, 不省略判断条件等于真, 空, null的情况
- 尽可能不要使用简写
- 尽可能使用style属性赋值, 而不是 cssText 文本或 textContent 文本
- 不要删除已有的空值断言, 注释等
- 如果中文变量名或函数名等能表达含义, 就不需要写同样含义的注释了
- 在不影响逻辑的情况下, 将代码写的尽可能短, 尽量减少不必要的换行
- 写出完整的类型, 尽可能不要使用 any
- 写类型时, 尽可能写 type 而不是 interface
- 尽可能不要用 addEventListener, 而是用 onxxx, 避免回调函数被一直持有造成内存泄漏
- 避免使用 DOM 查询 (例如 `querySelector`)，而是将元素保存为类的 private 成员变量来持有对象引用，避免 DOM 结构变化导致代码失效。
- 数据库里永远存UTC时间
- 文件名总是使用英文, 并且使用短横线连接, 而不是用驼峰, 因为git对大小写不敏感
- 谨慎的使用'as'强制类型转换, 优先考虑用 zod 进行类型类型校验和收窄
- 极度谨慎的使用 'as Record<string, any>', 'as Record<string, unknown>', 'as any', 'as unknown' 等不安全的写法, 优先考虑用 zod 进行类型类型校验和收窄
- 进行 zod 校验时，不要分两行(如声明临时变量 parsed)进行中转，而是总是直接在一行里组合调用, 例如: Schema.parse(JSON.parse(json))
- 解析 JSON 或执行其他可能返回 `any` 的操作时，应尽可能将其直接内联到期望强类型的函数调用中，而不是先赋值给临时变量，以避免触发 'Unsafe assignment of an any value' 等校验报错。例如：`API管理器.请求postJson('/api/xxx', JSON.parse(jsonStr))`。
- 旧代码兼容性：修改代码时，如果发现涉及到需要兼容旧有数据或旧代码逻辑（如保留带特定名称的旧角色、兼容旧格式等），不要默默地自行编写冗余的兼容性代码。遇到这种情况时，请务必先主动询问用户，由用户明确决定是否需要兼容。
- 联合类型判断: 对于如 `obj.type` 等可枚举类型，请总是使用 `switch` 语句而不是连续的 `if`。这不仅是为了避免最后一条 `if` 因类型推断收窄而触发 `@typescript-eslint/no-unnecessary-condition` 报错，更是为了配合项目启用的 `@typescript-eslint/switch-exhaustiveness-check` 和 `@lsby/no-switch-default` 规则，利用 `switch` 的有穷性检查机制。这样当未来联合类型或枚举增加新成员时，如果没有补全对应分支，TypeScript 就会在编译期抛出错误，极大提升代码安全性。
- 请勿使用 eslint-disable max-lines 来禁用行数检测

## 关于测试

- 除非用户要求, 否则不要主动写测试
- 测试分单元测试, 集成测试和端到端测试
  - 单元测试: 使用 Co-location 测试风格, 测试代码和接口代码在同一文件夹, 参考 `src/interface/demo/base/add/t01.test.ts`
  - 集成测试: 借助接口两用性, 对多个接口进行集成测试, 写在 `test/integration` 文件夹中
  - 端到端测试: 借助 playwright, 实际模拟用户操作来进行测试, 写在 `test/e2e` 文件夹中, 注意 `test/e2e/tools/demo-mode.ts` 提供了一种 demo 模式, 方便做演示, 但调试代码时, 总是使用非 demo 模式来快速开发
    - `DEMO_MODE=true` 时会使用有头浏览器, 并开启演示说明浮层、操作动画和额外等待; `DEMO_MODE=false` 时会使用无头浏览器并跳过上述演示效果。该变量只控制展示方式和执行速度, 不改变测试操作、断言或测试数据
- 测试流程
  - 准备阶段, 需要彻底清空测试数据库, 并重新执行初始化脚本
  - 运行前, 如果需要构造特定数据, 可以通过数据库句柄插入
  - 运行中, 必须使用黑箱模式(只能通过接口两用性调用接口来操作), 严禁使用数据库句柄
  - 运行后, 如果需要验证数据库的数据变更, 可以使用灰箱模式(可以通过数据库句柄直接查询数据库验证数据是否符合预期)
  - 完成后, 无需再次清空测试数据库, 它会在下次运行测试前被清空
