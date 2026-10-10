# 测试规范与机制说明

## 端到端测试 (E2E Testing)

- **概念与定位**: 模拟用户实际操作进行测试，验证应当贴近真实行为。
- **目录结构**: 用例统一存放在 `test/e2e/` 目录下。
- **验证边界原则**:
  - 在核心运行过程中必须通过接口调用或 UI 操作, 严禁直接绕过业务的入口逻辑。
  - **黑盒执行**: 测试执行过程应是黑盒的, 禁止通过 API 接口, 数据库句柄伪造初始状态。
  - **灰盒验证**: 验证过程可以是灰盒的, 允许通过数据库句柄等手段断言和验证底层数据结果。
- **演示模式 (Demo Mode)**:
  - 这是端到端测试的一个变种，遇到特定的函数将暂停并弹出提示，等待用户点击确认后继续。
  - **隔离原则**: 演示模式的变量应该仅仅用来控制浏览器界面的可见性、视觉反馈效果以及减慢等待时间，绝对**不应该**因为演示模式的开启而改变核心业务操作、断言逻辑或者测试数据。确保演示效果跟在无头环境下跑测试的行为完全一致。
  - 演示交互模型参见：`src/model/test-interactive/`。
  - _开发建议_: 调试代码时，总是使用非演示模式来快速测试。
- **运行命令**:
  - 运行 `npm run test:e2e` 支持交互选择、`--all` 全量执行、指定测试文件名。
  - 参数支持 `--auto` (无头模式) 或 `--demo` (演示模式)。
  - 测试结束后默认在 `test-outputs/playwright-report/index.html` 生成 Playwright 测试报告。

## 需求测试 (Requirement Testing)

- **概念与定位**: 以业务需求和验收点为中心, 不限制具体测试技术。核心模型与使用说明见 `src/model/test-requirement/README.md`。
- **目录结构与约定**:
  - 存放在 `test/requirement/`。每个业务需求拥有一个独立的子目录。
  - 需求模型统一命名为 `model.ts`，可执行入口统一命名为 `index.spec.ts`。参考：`test/requirement/demo/`。
  - 所有目录、文件、任务和配置统一使用 `requirement` 命名, **不建立平行测试体系**。
- **流程规范**:
  - `scripts/test/check-requirement-coverage.ts` 会自动递归扫描并统计覆盖率，新增需求无需手动注册。
  - 测试初始化阶段可直接准备数据，但**业务行为和观察**必须通过真实业务入口完成，并返回符合项目证据策略的证据。
  - 演示模式只控制展示和速度, 同样**不得改变**测试的流程, 断言, 证据或核心数据。
- **运行命令**:
  - 更新模型后执行 `npm run task -- test:requirement:coverage` 刷新覆盖率。
  - 执行测试使用 `npm run test:requirement`（支持交互、`--all` 全量、`--scenario=<流程名>`、`--requirement=<需求名>`、`--auto` / `--demo`）。
  - 选中人工验收流程时会询问是否跳过（可用 `--skip-manual` / `--no-skip-manual` 指定）。非 TTY 环境默认跳过人工验收；不跳过时，非演示模式的人工确认会以"需人工验收"明确失败。
  - 测试快照默认仅保留最近10个，显式清空请运行 `npm run task -- clean:requirement-snapshots`。
  - 生成报告位于 `test-outputs/requirement-report/index.html`，包含 Playwright HTML 报告与业务证据附件。

## 单元测试 (Unit Testing)

- **概念与定位**: 只测试某一个单独的模块, 例如单个接口。
- **目录结构**: 采用与目标代码同目录 (Co-location) 的存放方式, 例如 `src/interface/demo/base/add/t01.test.ts`。
- **运行命令**:
  - `npm run test:unit` 支持交互选择，或通过参数控制: `--all` 全量执行, `--filter <正则>` 筛选接口, `--no-coverage` 跳过覆盖率生成, `--open` 自动打开报告。
  - 默认无需额外参数即自动生成代码覆盖率与测试报告至 `test-outputs/coverage/index.html`。

## 集成测试 (Integration Testing)

- **概念与定位**: 测试一系列单元的组合运行情况。借助接口两用性, 可以在不构造服务器环境的情况下, 对接口逻辑进行直接调用。
- **目录结构**: 集成级别的测试应当放在 `test/integration/` 下。参考 `test/integration/demo.ts`。
- **运行命令**:
  - `npm run test:integration` 支持交互选择, `--all` 全量执行, 或直接指定文件名 (如 `demo.ts`), 及通过 `--open` 自动打开报告。
  - 默认自动收集用例执行日志与状态, 生成 HTML 与 JSON 测试报告至 `test-outputs/integration-report/index.html`。
