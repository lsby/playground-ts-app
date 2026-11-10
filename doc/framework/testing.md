# 测试规范与机制说明

项目提供**单元测试**、**集成测试**与**需求测试**。浏览器端到端用例作为需求流程运行，也可以在同一条流程中结合其他手段验证。

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

## 需求测试 (Requirement Testing)

- **定位与模型**: 以业务需求和验收点为中心，通过命令、HTTP 或浏览器等方式执行流程，并由代码判定结果。核心领域模型（需求、验收点、状态迁移、行为、观察、步骤附件、选择等）详见 `src/model/test-requirement/README.md`。
- 手写用例和使用 MCP 录制的约定见 [AI 需求测试提示词](requirement-test-ai.md)。
- **执行边界**:
  - 每次流程尝试都会清空并初始化同一份 Web 测试数据库，再准备业务数据和工具。整条流程通过后才记下其证明的验收点。
  - 需要后端的流程在每次尝试时启动测试服务。`工具.服务地址()` 提供地址。工具按步骤记录收到的标准输出和错误输出，`工具.后端日志.读取()` 可查看当前步骤已收到的日志。
  - `工具.浏览器` 可按名称打开、列出、获得和关闭独立会话。引擎在导航、操作、等待、断言或步骤收尾时按需截图，尝试结束收集最终画面与 Trace。`--demo` 开启可见浏览器、提示和动画，业务步骤和断言与默认的 `--auto` 模式相同。
  - 数据库查询使用测试数据库的只读连接，返回完整结果供断言使用。报告默认隐藏参数和查询结果值，显式列入 `报告列` 的公开字段最多预览 20 行。
- **入口与命令**:
  - 由 `scripts/test/requirement/run-requirement.ts` 驱动。
  - 运行 `npm run test:requirement`。可交互选择，或指定 `--all`、`--scenario=<流程名>`、`--requirement=<需求名>`、`--list`、`--auto` 或 `--demo`。任务参数 `--prepare-only` 可预览计划。
  - 每个需求的定义和流程都放在 `test/requirement/<name>/`。可以分次导出流程，并引用同目录下的 `<name>.requirement.ts`。列出流程和选定流程回放时允许缺少覆盖。全量运行遇到未覆盖的验收点时，会生成报告并返回失败，数据库准备和流程执行都不会开始。
  - 自动模式在 CI 中每条流程最多尝试三次。报告输出至 `test-outputs/requirement-report/`。HTML 和 JSON 报告包含只有描述文件的需求。验收点没有关联流程时为「未实现」，有关联流程但没有尝试时为「未执行」。需求按「未证明、未实现、未执行、已证明」从高到低汇总。HTML 目录和执行结论展示验收点名称，详情展示完整描述。打开对应的流程尝试可以查看步骤、附件、失败信息和浏览器 Trace。

## 交互式测试 MCP

测试开发套件把操作、结果和证据路径写入 `operations.json`。可以在保留浏览器和数据库现场的同时修剪记录，再导出为可回放的需求测试。

### 启动和连接

在 `.env/.env.test.web` 中设置 `TEST_MCP_ENABLED=true`，然后在仓库根目录运行：

```sh
node --import tsx scripts/task/index.ts dev:test
```

也可以在 VS Code 按 `F1`，选择「运行任务」→「启动测试环境开发套件」。要使用与正式回放相同的前端构建，在上述启动命令后加 `-- --replay-build`。构建模式修改源码后需要重启套件，默认模式支持热更新。

等终端输出 `TEST_DEV_READY`，再用本机 MCP 客户端连接同一行的 `mcpUrl`。使用默认端口时，Codex CLI 的添加命令如下。

```sh
codex mcp add playground-test --url http://127.0.0.1:30006/mcp
```

重新打开客户端会话后，用 `test_info` 查看测试地址和记录路径。命令语法见 [OpenAI Docs](https://developers.openai.com/learn/docs-mcp#quickstart)。

### 工具与录制

- `browser_*` 操作浏览器并检查页面，`database_query` 只读查询测试库，`backend_logs` 查看测试后端日志。
- `http_request` 请求当前测试后端的接口。管理员请求可用 `auth: 'test-admin'`，测试密码字段使用 `$test-password:<标签>`。
- `database_reset` 关闭浏览器会话、重置测试库并重启后端。默认保留操作记录，传入 `clearRecord: true` 可一并清空。
- `record_add_assertion` 用 `expected` 核对固定值，用 `expectedFrom: { sourceId, path }` 比较两次操作的结果。导出时，把断言引用的操作都放在断言前。

### 退出后再回放

在另一个终端用 `TEST_DEV_READY` 中的 `stopId` 关闭同一实例。下面的命令会等待浏览器证据保存、服务停止和测试库锁释放。

```sh
node --import tsx scripts/test/dev-suite.ts --stop <stopId>
```

开发套件和回放共用 Web 测试库。等套件退出后再运行 `npm run test:requirement`。
