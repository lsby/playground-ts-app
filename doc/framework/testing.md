# 测试规范与机制说明

本系统提供从代码单元、模块协作、真实用户交互到业务需求验收的多视角测试模型，分别对应**单元测试**、**集成测试**、**端到端测试**与**需求测试**，以便针对不同验证目标选择合适的测试层级与手段。

## 单元测试 (Unit Testing)

- **定位与目录**: 测试单个独立模块（如单个接口），与目标代码同目录存放（如 `src/interface/demo/base/add/t01.test.ts`）。
- **入口与命令**:
  - 由 `scripts/test/unit/run-test.ts` 驱动。
  - 运行 `npm run test:unit`（支持交互选择、`--all` 全量、`--filter <正则>` 筛选、`--no-coverage` 跳过覆盖率、`--open` 打开报告），默认生成覆盖率与测试报告至 `test-outputs/coverage/index.html`。

## 集成测试 (Integration Testing)

- **定位**: 测试多模块组合运行，可借助接口两用性在不启动服务器的情况下直接调用接口逻辑。
- **目录与编写约定**:
  - 存放在 `test/integration/`（参考 `test/integration/demo.ts`），默认导出无参构造的 `集成测试` 子类。
  - 构造函数仅声明名称与配置，数据准备和断言放在 `运行()` 内；模块导入与实例构造阶段不得启动数据库或任务资源。
- **运行边界**: 通过抛错表达失败，禁止自行调用 `process.exit()`；自建资源在 `finally` 中释放，共享单例随命令结束统一退出。
- **入口与命令**:
  - 由 `scripts/test/integration/run-integration.ts` 驱动。
  - 运行 `npm run test:integration`（支持交互选择、`--all` 全量、指定文件名、`--open` 打开报告），报告输出至 `test-outputs/integration-report/index.html`。

## 端到端测试 (E2E Testing)

- **定位与目录**: 模拟真实用户操作。用例存放在 `test/e2e/**/*.ts`（公共封装放 `test/e2e/helper/`），默认导出无参构造的 `端到端测试` 子类（基类位于 `src/model/test-e2e/`），按顺序执行 `准备数据()` 和 `主流程(引擎)`。
- **验证边界**:
  - **黑盒执行**: 核心流程必须通过 UI 操作或接口调用完成，严禁绕过业务入口或直接写库伪造初始状态。
  - **灰盒验证**: 允许通过数据库句柄等底层手段断言最终数据结果。
- **浏览器引擎与演示模式**:
  - 浏览器测试引擎位于 `src/model/browser-test/`，用例通过引擎操作页面并调用 `引擎.断言()`。
  - **隔离原则**: 演示模式（`--demo`）仅控制界面可见性、高亮说明卡片、放慢节奏与人工暂停，**严禁**改变业务操作、测试数据或断言逻辑，确保与无头模式（`--auto`）行为一致。自动模式下请求人工核验会直接报错；日常调试建议优先使用非演示模式。
- **入口与命令**:
  - 由 `scripts/test/e2e/run-e2e.ts` 启动 `test:e2e:server` 并顺序执行用例。
  - 运行 `npm run test:e2e`（支持交互选择、`--all` 全量、指定文件名、`--list` 仅列出用例、`--auto` / `--demo` 切换模式），报告、截图与 Trace 输出至 `test-outputs/e2e-report/`。

## 需求测试 (Requirement Testing)

- **定位与模型**: 以业务需求和验收点为中心，不限定具体测试手段（命令、HTTP、浏览器、人工检查均可）。核心领域模型（需求、验收点、状态迁移、行为、观察、证据、选择等）详见 `src/model/test-requirement/README.md`。
- **目录与编写约定**:
  - 存放在 `test/requirement/`（参考 `test/requirement/demo.ts`，公共封装放 `test/requirement/helper/`），统一使用 `requirement` 命名，不建立平行测试体系。
  - 默认导出无参构造的 `需求测试` 子类，构造时登记需求和流程，通过 `准备上下文()` 提供运行上下文、附件收集与资源释放。
- **执行边界**:
  - 每条流程均从全新初始状态开始，不提供快照或中途续跑。初始化阶段可直接准备数据，但**业务行为和观察**必须通过真实业务入口完成；观察无副作用，满足预期时返回 `证据`，否则抛错终止。
  - 浏览器流程通过无头自动模式的 `浏览器测试引擎` 访问 `test:requirement:server` 启动的被测服务。标记为人工验收的流程保留在覆盖模型中，运行器会自动跳过。
- **入口与命令**:
  - 由 `scripts/test/requirement/run-requirement.ts` 驱动。
  - 运行 `npm run test:requirement`（支持交互选择、`--all` 全量、`--scenario=<流程名>`、`--requirement=<需求名>`，或通过 `--prepare-only` 预览计划），报告输出至 `test-outputs/requirement-report/`。
