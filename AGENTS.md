# lsby-playground-ts-app 开发导览

这是一个具有多个部署目标的全栈 TypeScript 应用程序:

- **Web 服务器**: Express-like 服务器
- **纯前端应用**: 后端逻辑与数据库打包至浏览器的应用
- **桌面应用**: 使用 Electron 编译的桌面应用
- **移动应用**: 使用 Capacitor 编译的移动端应用
- **单文件应用**: 使用 Node.js SEA 编译的单文件可执行程序
- **命令行应用**: 命令行应用

## 导引与通用规范

- 修改代码前, 先根据任务类型找到最接近的 demo, 完整阅读相关前后端实现和已有测试, 再沿用其结构
- demo 用于展示标准写法, 项目定制业务代码应写入 `src/interface/project/`, `src/web/components/project/` 等项目目录. 除非任务本身是维护示例, 否则不要把业务需求写进 demo
- 优先复用已有接口逻辑, 组件, 管理器和工程任务, 不要建立职责重复的平行体系
- 本文件记录入口, 约定和不可破坏的边界, 具体实现细节以当前源码, 配置, 生成结果和静态检查为准. 路径或行为变化时同步更新本文件
- 修改代码时, 不要删除任何示例, 这些示例是精心构造的, 以便于在各种情况下参考

## 通用约定

- **命名与工程约定**:
  - 变量, 函数, 类和方法等尽可能使用中文
  - 新建的项目自有源码文件使用英文小写短横线命名, 以兼容大小写不敏感的文件系统, 生态约定名称和生成文件除外
  - 使用 `tsx` 运行 TypeScript, 而不是 `ts-node`
- **语法与类型**:
  - 始终使用 `let`, 不使用 `var` 和 `const`
  - 函数显式声明返回类型(explicit-function-return-type), 类成员显式声明访问修饰符(explicit-member-accessibility)
  - 优先使用 `type` 而不是 `interface`
  - 谨慎使用 `any`, 作为中转类型的 `unknown` 和 `as` 强制转换, 不可信数据必须经过 Zod 或等价的严格校验和收窄
  - 在框架适配, 第三方类型缺失或 TypeScript 确实无法表达类型关系时, 允许局部使用 `src/tools/types.ts` 中的 `已审阅的any`, 使用前必须人工确认类型安全, 并且不得让 `any` 污染扩散到业务边界
  - 对不可信输入始终使用 Zod 校验和收窄, 解析操作可能返回 `any` 时, 应将结果直接传入 Schema, 禁止把未经校验的结果直接传入业务函数或强类型调用
  - 禁止非空断言(no-non-null-assertion)和取反非布尔表达式(no-negation), 条件显式判断布尔值(strict-boolean-expressions), `null` 和 `undefined`, 让空值分支参与类型检查
  - 数组下标访问必须处理越界 (项目启用了 `noUncheckedIndexedAccess`)
  - 对有穷判别联合进行分支时使用穷尽 `switch`, 不要使用 `default` 兜底, 不使用连续 `if` 或 `if-else`, 防止遗漏新增枚举
  - 禁止浮动 Promise, 仅在明确无需等待时谨慎使用 `void`
- **质量与维护原则**:
  - 遵循 Fail-Fast 原则, 不要写掩盖问题的兜底逻辑. 缺少配置, 数据不符合契约或遇到未知状态时应尽早明确报错, 不要用默认值, 空结果或静默捕获让错误延后暴露; 只有业务明确允许恢复时才提供兜底
  - 环境变量配置严禁出现默认值 (如 `.default(...)`) 或设为可选 (如 `.optional()`), 必须严格遵循 Fail-Fast 原则. 缺少环境变量时必须立即报错终止; 即使某个环境不需要某项环境变量, 也必须在所有环境配置文件及示例文件中显式提供空字符串等写法
  - 不使用 `eslint-disable max-lines` 绕过行数检查, 文件过长时应拆分职责
  - 不要顺手删除已有的校验, 断言, 注释或空值处理, 它们可能承载当前上下文之外的边界条件
  - 中文命名已能表达含义时不写重复注释, 在不影响可读性的前提下保持简短
  - 遇到可能需要兼容旧数据或旧逻辑的场景时询问用户, 不要默默地自行编写冗余的兼容性代码, 因为兼容修改会增加维护成本
  - 写出完整的类型, 谨慎使用 `any`, `unknown` 和 `as`, 尤其避免通过 `as Record<string, any>`, `as Record<string, unknown>`, `as any` 或 `as unknown` 绕过类型检查
  - 进行 Zod 校验时优先直接组合解析与校验, 例如 `Schema.parse(JSON.parse(json))`, 需要临时变量时, 应让未经校验的值保持在明确的边界内并立即收窄

## 架构设计与各端规范

### 接口

- **核心建模**:
  - 接口层基于 `@lsby/net-core`, 核心分层为:
    - 插件负责解析和校验输入, 注入能力及承载副作用
    - 接口逻辑负责组合可复用的应用过程与副作用
    - 返回器负责协议适配和输出
  - 请求参数, 响应, 错误, 上下文和 WebSocket 消息都应处于类型契约内
  - 同一份接口逻辑既可以作为 HTTP 接口运行, 也可以在其他接口中直接调用
  - 最小完整示例见 `src/interface/demo/base/add/index.ts`, 内部复用示例见 `src/interface/demo/base/sub/index.ts`
- **目录与生成文件**:
  - 接口代码统一放在 `src/interface/` 目录下
    - 其中演示用接口放在 `src/interface/demo/`
    - 项目定制业务接口放在 `src/interface/project/`
    - 通用的系统, 用户和管理能力按职责放在现有的 `system/`, `user/` 等目录中
  - 可复用的接口业务编排放在 `src/interface-logic/`, 纯领域契约与规则放在 `src/model/`
  - 生成器会自动输出:
    - 接口路由列表文件至 `src/interface/interface-list.ts`
    - 接口的 TypeScript 类型定义至 `src/types/interface-type.ts`
- **场景示例**:
  - 包含基础用法的最小 JSON 示例在 `base/add/`, 内部调用在 `base/sub/`, 错误返回在 `base/div/`
  - 包含典型业务的 CRUD 接口示例在 `src/interface/demo/crud/user/`, 对应前端组件在 `src/web/components/demo/user-management-demo.ts`. 表单示例在 `src/interface/demo/form/form-submit/`, 文件处理示例在 `src/interface/demo/file/`
  - 进阶场景包括 WebSocket (`ws/ws-test/`), 组合逻辑的逆序清理 (`logic-advanced/cleanup-order/`), 事务回滚 (`logic-advanced/rollback-test/`) 和插件机制 (`plugin-advanced/`)
  - 跨端示例包括纯前端模式 (`pure/pure-string/`) 和 Electron 模式 (`electron/`)
- **接口约定**:
  - 接口应尽可能使用 POST 请求, 除非需要依赖 GET 等缓存能力, 不要强行使用 REST 风格
  - 必须保持契约的严格性, 谨慎使用 `z.any()`, `any` 或 `as`, 不得仅为了绕过接口契约而使用它们, 确有动态数据或框架适配需要时必须限制作用域并人工确认类型安全
  - 处理递归或共享的复杂类型时, 可参考 `src/interface/demo/plugin-advanced/custom-type-export/`
    - 需要在独立文件 `types.ts` 中定义并通过 `NetCoreExportType` 导出, 让生成器能正确识别导出类型
    - 入口处需本地声明严格的 `z.lazy()` Schema, 以保留运行时的参数和返回值校验 (因为生成器无法跨文件深入解析 `z.lazy()`)

### 数据库

- **基本约定**:
  - 项目使用 Prisma 搭配 Kysely 作为技术栈
  - 数据结构定义位于 `prisma/schema.prisma`
  - 在应用 Prisma 时会自动生成 Kysely 类型: `src/types/db.ts`
  - 数据库时间统一存 UTC, 展示时再按用户时区转换, 避免跨时区数据歧义
- **迁移约定**:
  - 普通 Schema 变更使用 `npm run task -- db:push:dev:web` 生成并应用 migration, 同时更新数据库类型
    - 禁止使用 `prisma db push`, 因为它会直接修改数据库但不生成 migration, 导致 Schema, 数据库和部署记录脱节
  - 生产, 测试和打包环境只使用 `prisma migrate deploy` 或项目中等价的部署任务应用已有 migration, 以保证不同环境执行同一份可追踪变更
  - 当迁移 SQL 需要手工调整时, 使用例外流程. 先运行 `npm run task -- db:migrate:create:dev:web -- --name <迁移名称>` 仅生成 migration, 修改并检查新生成的 `migration.sql`, 再运行 `npm run task -- db:push:dev:web` 应用迁移

### Web 前端

- **结构与目录**:
  - 框架基类在 `src/web/base/base.ts`, 各个页面的入口文件放在 `src/web/page/`
  - 组件均存放在 `src/web/components/` 目录下
  - 页面入口由生成器根据 HTML 中直接使用的自定义元素标签精确生成至 `src/web/page/entry/`, 目录结构与页面保持一致. 不要手工编辑入口文件或建立会注册全部组件的统一入口; 页面新增组件标签后运行生成任务即可
    - 各种通用组件如基础布局, 表单, 表格和标签页存放在 `general/` 下
    - 业务组件放在 `project/` 中
  - 全局使用的管理器存放在 `src/web/global/manager/` 中, 而全局公共样式维护在 `src/web/global/style/global.css`
- **场景示例**:
  - 核心功能示例包括 `src/web/components/demo/add-demo.ts`, 以及展示元素引用与状态管理的 `src/web/components/demo/todo-list-demo.ts`
  - 业务功能示例涵盖 `src/web/components/demo/user-management-demo.ts`, 以及处理文件上传的 `src/web/components/demo/file-upload/`
  - 通用扩展组件示例位于 `src/web/components/demo/general-components-demo.ts`, 覆盖反馈与空状态, 日期时间, 异步组合框, 文件选择上传, 抽屉和折叠面板
  - 进阶场景包括 `src/web/components/demo/ws-demo.ts`, `src/web/components/demo/dialog-demo.ts` 和 `src/web/components/demo/toast-demo.ts`
  - 跨端适配示例包括 `src/web/components/demo/electron-demo.ts` 和 `src/web/components/demo/capacitor-demo.ts`
- **组件与 DOM**:
  - 注册的组件名应使用英文字符并符合 Custom Elements 规则
  - 动态创建标准元素时统一使用 `src/web/global/tools/create-element.ts` 中的工厂方法, 以复用项目对属性, 样式和子元素的类型化处理, 不要在业务组件中直接使用 `document.createElement`
  - 实例化自定义组件时可直接使用 `new` 关键字
  - 应该将复用的元素保存为类的 private 成员变量来进行引用, 避免由于 DOM 树变化导致查询失效
  - 应当避免使用 DOM 查询 (如 `querySelector`), 这非常脆弱
  - 发送网络请求应统一调用 `src/web/global/manager/api-manager.ts`, 它会自动推断接口的参数和返回类型
    - 需要尊重类型推导结果, 不得使用 `as` 掩盖接口参数或返回值的类型错误
  - 组件的 `刷新` 应优先更新当前视图并保留已挂载的后代组件; 只有确实需要重新执行完整挂载生命周期时才调用 `重建`
- **样式与交互**:
  - 前端源码 (包括界面文案和浏览器调试日志) 不使用 emoji, 项目脚本以及服务端, 命令行日志不受此约束. 需要图形符号时使用 `src/web/components/general/base/icon.ts`
  - 自定义组件对外发送状态变化, 点击, 打开, 失焦等通知时, 统一使用 `组件基类` 提供的类型化事件机制: 组件内部调用 `派发事件`, 直接消费组件事件时调用 `监听发出事件`, 监听后代组件的冒泡事件时调用 `监听冒泡事件`
    - `监听发出事件` 只接收当前组件自身派发的事件, `监听冒泡事件` 只接收后代组件冒泡到当前组件的事件; 两者不得混用
    - 不要再为同一项通知并行提供 `onX` 公共属性, `X处理函数` 配置回调和组件事件等多套 API; 事件的 `detail` 应携带调用方所需的完整数据
    - 只有当函数代表命令或数据提供器, 且组件必须等待其 Promise 来维持加载状态, 处理错误或保证执行时序时, 才保留配置回调或方法参数; 此类回调需要通过命名或注释明确命令语义, 纯观察事件监听原因通知仍使用组件事件
    - 组件事件监听器是通知观察者, 派发方不得依赖或等待异步监听器的完成结果
  - 进行事件绑定时优先使用类似 `onclick` 的属性方式, 便于替换处理函数并避免重复绑定
    - 仅在确实需要多个监听器或事件选项时使用 `addEventListener`, 并确保监听器生命周期与元素一致, 必要时显式移除
  - 设置样式时应优先使用类型化的 `style` 属性直接赋值
    - 避免拼凑或设置 `cssText`, 使用 `style` 属性能获得完整的属性提示及类型检查
  - UI 的主题与颜色应复用 `global.css` 中的 CSS 变量, 这样可以让组件自动适配全局主题和暗色模式
  - 浮层管理器处理外部指针关闭时, 只在同一指针于外部按下且于外部松开时关闭; 模态框, 对话框和抽屉以遮罩区域为外部, 不可关闭的浮层不响应遮罩操作
  - 针对滚动条的约定:
    - 页面上的滚动区域应优先使用 `src/web/components/general/base/scroll-container.ts`, 由外层布局组件明确掌握滚动的职责
    - `组件基类` 已经会向 Shadow DOM 内的 `:host` 和所有元素注入 `src/web/global/style/scrollbar.ts` 中的统一滚动条样式, 继承该基类的组件不要重复注入, 只有未继承该基类的独立 Shadow DOM 才需要显式应用

### 纯前端

- **核心规范与架构设计**: 纯前端 (Pure Frontend) 的核心组件（API Worker, SQLite Worker, IndexedDB 持久化）、生成与配置、以及并发锁机制等详细设计规范，请参见 [doc/framework/pure-frontend.md](file:///d:/Code/playground-ts-app/doc/framework/pure-frontend.md)。
- **注意**: 纯前端标注的接口会在本地浏览器运行，开发时必须运行完整的 `npm run task -- dev:pure-frontend` 以监听派生文件的更新。

### 本地优先

- **核心规范与架构设计**: 本地优先 (Local-First) 的核心概念（基线与当前双库、字段级三方合并）、同步协议、生命周期以及离线保证等详细设计规范，请参见 [doc/framework/local-first.md](file:///d:/Code/playground-ts-app/doc/framework/local-first.md)。
- **注意**: 进行本地优先的业务开发或维护时，**必须**完整阅读并遵循上述文档中的同步边界与并发排他保护机制。

### 样例模式

- **规范与最佳实践**: 样例模式的设计哲学、编写原则（坚持硬编码、杜绝过度设计、容忍联动断裂）以及运行机制，请参见 [doc/framework/sample-mode.md](file:///d:/Code/playground-ts-app/doc/framework/sample-mode.md)。

### 任务系统

- **即时任务**:
  - 即时任务的示例实现位于 `src/job/instant-job/`, 核心抽象类定义在 `src/model/job-instant/instant-job.ts`
  - 相关任务由 `src/model/job-instant/instant-job-manager.ts` 负责管理
- **定时任务**:
  - 定时任务的示例实现位于 `src/job/scheduled-job/`, 核心抽象类定义在 `src/model/job-scheduled/scheduled-job.ts`
  - 相关任务由 `src/model/job-scheduled/scheduled-job-manager.ts` 负责管理

## 领域模型与接口逻辑

- **分层职责与定位**:
  - `src/interface/` (协议适配层): 负责输入输出契约声明、插件挂载与返回器响应适配；仅承载当前入口独有的输入解析与调用，不重复实现领域规则。
  - `src/interface-logic/` (应用编排层): 存放可被多个接口、任务或入口复用的业务过程与副作用编排。
    - 包含仓储读写、数据库事务边界、跨模型校验、身份与权限验证、外部服务集成等，负责把领域模型与基础设施组装为完整用例。
    - 仅凭文件名 (如命名为 `model.ts`) 不能定义其实质；归属完全取决于是否引入了副作用与基础设施依赖。
  - `src/model/` (纯粹领域层): 存放与具体入口、运行目标和基础设施解耦的核心领域模型。
    - 包含领域数据结构、Zod Schema、值对象、业务错误、业务不变量、状态转换、命令执行、差异比对与确定性领域计算。
    - 严格禁止依赖任何外部基础设施 (包括 HTTP/WS 协议、`@lsby/net-core` 插件、Kysely/数据库类型、环境变量、第三方 SDK、文件系统等)。

- **依赖单向流动规则**:
  - 依赖关系单向向下: `接口 (src/interface/)` / `任务 (src/job/)` -> `业务编排 (src/interface-logic/)` -> `领域模型 (src/model/)`。
  - `src/model/` 允许在不同领域边界间横向依赖，但**绝对禁止**反向依赖上层的 `interface-logic/`、`interface/`、`web/` 或 `job/`。
  - Web 前端需复用时，只允许引用 `src/model/` 或自动生成的接口类型，**严禁**引用 `src/interface-logic/`。

- **设计与实践原则**:
  - **杜绝过度设计**: 不为了形式上的分层去机械封装缺乏行为的类、薄仓储包装或重复的 DTO。利用好 TypeScript 的判别联合、纯函数和 Zod Schema 即可清晰表达领域。
  - **样例模式边界**: 样例模式下的硬编码 Mock 数据属于临时接口逻辑，就近存放在接口分支内，不得进入 `src/interface-logic/` 和 `src/model/`；只有真实业务成立的契约与不变量才属于领域模型。

## 工程化与运维部署

### 环境变量与路径

- **环境变量机制**:
  - 环境变量的模型被定义在 `src/global/env.ts` 中, 而加载它的机制位于 `src/global/env-provider.ts`
  - 工程任务直接指定入库的正式环境文件. `CONFIG_ENCRYPTION` 控制明文或逐项加密模式, 加密模式的项目密钥位于根目录 `.project-config.key` 并严禁入库. `NODE_ENV` 与 `BUILD_TARGET` 在加载时校验运行环境, `LOCAL_MODE` 控制本地免登录, `SAMPLE_MODE` 控制选中业务接口的样例分支
  - `DEPLOY_ALLOW_DIRTY_GIT` 控制部署脚本是否允许工作区、暂存区或未跟踪文件不干净. 它只放宽 dirty 检查, 发布信息中的提交哈希必须始终由发布脚本直接从当前 Git 仓库计算
  - 人工修改加密配置时先运行 `env:decode` 生成 `.decode`, 修改后运行 `env:encode` 写回正式文件并清理全部 `.decode`; 程序运行、构建和发布过程只在内存中解密
  - 环境加密相关任务为 `env:decode`, `env:encode`, `env:enable-encryption`, `env:disable-encryption` 和 `env:status`; 均通过 `npm run task -- <任务名>` 执行
  - 远程服务器配置统一维护在 `.env/.env.deploy`; GitHub Actions 使用名为 `PROJECT_CONFIG_KEY_FILE` 的 Secret 保存 `.project-config.key` 完整原始内容, 可运行 `npm run task -- setup:github-config-key` 配置
  - 环境变量应当通过 Zod 进行严格校验, 并且不提供业务兜底值, 以便让缺失的配置在启动或构建阶段就能尽早报错
  - 业务代码应统一使用解析好的 `环境变量` 对象, 而不要直接去读取 `process.env`. 这既能保留类型检查, 也能完美兼容前端环境的变量注入
  - 针对前端编译时的环境变量注入, 相关实现在 `src/web/mock/env-provider-mock.ts` 中
- **路径解析**:
  - Web 服务运行时的项目根目录和静态资源路径集中在 `src/app/app.ts`
  - Electron 的数据目录和预加载脚本路径在 `src/electron.ts` 中处理. SEA, Electron 和 Docker 的发布产物路径分别由 `scripts/public/` 下的对应发布脚本处理
  - 项目源码和工程脚本都禁止使用 `process.cwd()` 或向上搜索 `package.json` 的方式推断项目根目录, 因为不同执行入口和环境产物下的当前工作目录与文件层级并不稳定
  - 各入口应依据自身运行环境和产物结构显式计算路径, 不要假设所有目标共享同一种目录层级
- **安全与密钥**:
  - 模板仓库默认提供脱敏的明文正式环境文件. 写入真实密钥前应启用配置加密; `.decode` 只用于人工编辑且严禁入库

### 任务与生成文件

- **任务系统**:
  - 任务图表按领域模块化拆分在 `scripts/task/taskfile/` 目录中定义, 并在 `scripts/task/index.ts` 中集中聚合, 任务执行器与公共工具逻辑则放在 `scripts/task/model/` 目录
  - 你可以使用 `npm run task -- --list` 查看公开任务, 使用 `npm run task -- --list-all` 查看包含内部叶子任务在内的全部任务, 或者用 `npm run task -- <任务名> --dry-run` 预览具体的执行计划
  - 为了维持一个唯一的事实来源, `package.json` 的 scripts 里只保留最常用任务的快捷别名, 复杂的任务组合一律在 Taskfile 中通过 `依赖` 和 `依赖方式` 声明
  - 基础的叶子任务不应该反向调用包含它的组合任务, 以避免递归调用
  - 只有当输出结果互不覆盖时才可以安排任务并行执行, 以避免竞争冒险
- **初始化与监听**:
  - 仓库的初始化由 `scripts/setup/preinstall.mjs` 和 `scripts/setup/postinstall.mjs` 提供向导支持 (也可通过 `npm run setup:all` 手动重新触发)
  - 在初始化过程中, 会顺次分配本地端口 (`init-ports.ts`), 选择环境文件加密模式并协助执行项目重命名 (`rename-project.ts`)
  - `preinstall` 脚本执行时各种第三方包还没下载完毕, 因此只能使用 Node.js 的内置模块
  - 整个初始化流程必须保证幂等
  - 初始化流程中不能向控制台泄漏敏感 Secret
  - 初始化会准备全部运行目标的本地配置，不询问单个目标；运行 `npm run setup:all -- --help` 可查看所有交互选项对应的 CLI 参数
  - 系统级别的通用文件监听统一借助 `scripts/watch/watch.ts` 实现
- **文件生成机制**:
  - 运行 `npm run task -- generate:all` 即可触发全量代码生成
  - 所有派生文件都交由生成器覆盖维护. 任何手动修改都会在下次生成时被冲掉, 正确做法是去修改源头定义然后重新生成. 这些派生文件包含:
    - 数据库与接口层面的 `src/types/db.ts`, `src/interface/interface-list.ts` 以及 `src/types/interface-type.ts`
    - 前端相关与本地数据库层面的 `src/web/page/entry/**/*.ts`, `src/web/pure-frontend/local-api-list.ts`, `src/web/pure-frontend/local-api-policy.ts`, `src/web/pure-frontend/local-schema.ts` 和 `src/types/local-first-database-meta.ts`
    - 此外还包括注入到应用里的元信息文件 `src/app/meta-info.ts`, 其中项目标识由 `package.json` 的包名派生, 浏览器持久化键名和数据库文件名应复用该标识

### 部署与发布追溯

- **发布产物源码追溯与 Docker 远程部署**: 
  - 关于发布任务中 Git 状态拦截、Docker 自动化安全部署机制、以及手动运维流程（如数据库迁移冲突处理），请参见 [doc/framework/deploy-and-release.md](file:///d:/Code/playground-ts-app/doc/framework/deploy-and-release.md)。
  - 若需执行部署或遇到远程发布问题，**必须**优先参考上述部署指南。

## 测试与质量保证

### 测试机制

- **策略与理念**:
  - 除非用户在交互中明确要求, 否则禁止擅自去补齐或新增测试代码, 并不是所有修改都有写测试的价值, 可以询问用户, 但应该让用户决定
  - 所有测试默认均会生成格式化测试报告, 统一输出在 `test-outputs/` 目录下, 并在运行结束时在控制台输出可直接点击的报告链接
- **各级测试规范**: 关于单元测试、集成测试、端到端测试及需求测试的目录约定、运行命令和详细规范，请统一参阅 [doc/framework/testing.md](file:///d:/Code/playground-ts-app/doc/framework/testing.md)。

### 修改完成后的验证

- 普通源码修改优先运行 `npm run tidy:all`, 它会自动生成派生文件、自动修复代码格式与可自愈的 ESLint 规则, 并执行静态检查; 需要严格只读检查时可运行 `npm run check:all`
- 修改派生文件的源头定义后, 优先运行 `npm run tidy:all`, 并确认生成结果已同步更新
- 修改数据库 Schema 时使用本文件规定的迁移任务, 并检查生成的 migration 与数据库类型
