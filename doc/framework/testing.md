# 测试规范与机制说明

移动端框架、项目配置与两仓库同步边界见 [移动测试说明](mobile-testing.md)。

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
  - `工具.浏览器` 可按名称打开、列出、获得和关闭会话。自动模式跨项目、MCP 和回放共用一个无头浏览器名额；冲突时报告占用者，先关闭旧会话再打开。引擎在导航、操作、等待、断言或步骤收尾时按需截图，尝试结束收集最终画面与 Trace。`--demo` 开启可见浏览器、提示和动画，业务步骤和断言与默认的 `--auto` 模式相同。
  - 数据库查询使用测试数据库的只读连接，返回完整结果供断言使用。报告默认隐藏参数和查询结果值，显式列入 `报告列` 的公开字段最多预览 20 行。
- **入口与命令**:
  - 由 `scripts/test/requirement/run-requirement.ts` 驱动。
  - 运行 `npm run test:requirement`。可交互选择，或指定 `--all`、`--scenario=<流程名>`、`--requirement=<需求名>`、`--list`、`--auto` 或 `--demo`。可重复传入 `--scenario` 选择多个流程。任务参数 `--prepare-only` 可预览计划。
  - 需求、验收点、流程均可声明 `标签们: ['标签一', '标签二']`。可用 `--exclude-tag=<标签>` 排除命中的流程，或用 `--include-tag=<标签>` 仅执行命中的流程。两种模式互斥，同一选项可重复传入。标签区分大小写，流程自身、所覆盖的任一验收点或其所属需求命中任一标签，都视为整条流程命中。未知标签会报错。示例：`npm run test:requirement -- --all --include-tag=注册`。
  - 报告右上角记录本次包括和排除标签，条目的标签只在详情展示。目录默认隐藏被标签规则排除的条目，可打开「显示已排除」查看原因。排除的流程在测试服务和数据库准备前移出执行清单。
  - HTML 和 JSON 报告按运行范围生成：指定需求只列该需求；指定流程列出这些流程覆盖的验收点所属的所有需求；全量运行列出所有需求。默认隐藏没有执行的验收点和流程，仍汇总其状态及数量。加 `--show-unexecuted` 可以查看同一范围内的未执行流程，以及未执行或未实现的验收点。
  - 每个需求的定义和流程放在独立目录，描述文件统一命名为 `index.requirement.ts`。可在 `test/requirement/` 下按多层文件夹分组，例如 `test/requirement/shopping/checkout/index.requirement.ts` 在报告中显示为 `shopping → 需求标题`。列出流程和选定流程回放时允许缺少覆盖。全量运行遇到未覆盖的验收点时，会生成报告并返回失败，数据库准备和流程执行都不会开始。
  - 自动模式在 CI 中每条流程最多尝试三次。报告输出至 `test-outputs/requirement-report/`。状态规则、步骤证据和建议可在 HTML 报告中查看。

### 失败流程补测与运行前检查

`pnpm run test:requirement --retry-failed=test-outputs/requirement-report/<原报告>/report.json --list` 先列出原报告中失败或中断的已选流程，去掉 `--list` 后执行；标签过滤仍可使用。该选项与 `--all`、`--scenario`、`--requirement` 互斥。 快捷命令已包含任务分隔符，按上面写法直接传选项。不会自动选择从未执行的流程。执行前核对来源中的流程文件、需求名称与验收点名称及描述，定义变化时拒绝沿用旧结论。

补测目录同时保存本次 `index.html` / `report.json` 和 `combined.html` / `combined.json`。汇总保留原范围，采用每个流程最近一次实际执行结果；本次未执行不会覆盖原结果。每行链接到对应原始报告，旧失败、步骤和附件保留不改。后续可把 `combined.json` 作为再次补测的来源。报告列出已执行数量，错误按检查失败、脚本错误、环境错误或待诊断展示；检查失败需结合预期与实际判断业务原因。

运行前检查本地 `tsx`、`prisma` 命令，测试子进程显式加入项目 `node_modules/.bin` 路径，直接用 Node 启动也可找到依赖命令。浏览器安装与端口检查沿用现有入口。需求发现器记住 `test/requirement` 和 `test/requirement-support` 中已发现 TypeScript 源文件的内容；同一进程内文件被修改或删除时，要求重启测试进程或开发套件。新增导出文件可继续发现。

### 录制、定位与导出检查

自动截图和多帧观察只提供证据；就绪条件须显式使用 `browser_wait` / `browser_wait_url`，并在录制中保存业务检查。已录制操作返回 `replay.supported`；支持情况直接由导出器检查，不支持的操作会给出原因，应从回放草稿排除。`browser_screenshot` 支持导出为截图观察，截图自身不证明业务验收点。

浏览器目标支持 `within` 限定一个区域、对话框或容器，例如 `{ by: 'text', text: '未登录', exact: true, within: { by: 'role', role: 'status' } }`。多匹配时报告候选元素，收窄目标后再操作；零匹配保留 Playwright 的条件等待。手写 `evaluate` / `evaluateAll` 等回调内不要声明命名局部函数，tsx 的命名保留可能插入浏览器中不存在的 `__name`，ESLint 会指出危险写法；使用直接传入的匿名回调或对象方法。

导出超过 500 行时按完整步骤拆分到 `test/requirement-support/<需求目录>/<流程名>/`，入口保持步骤顺序，自动调整相对导入和图片资源路径。辅助文件不会被当成流程发现。单步骤或初始化仍过长时明确提示分组，不截断代码或删除检查。

## 交互式测试 MCP

测试开发套件自动把操作、结果和证据路径写入 `operations.json`。可以按业务步骤审阅和编辑回放草稿，再导出为需求测试。操作方法见 [AI 需求测试提示词](requirement-test-ai.md)。

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

- `browser_*` 操作浏览器并检查页面，`database_query` 只读查询测试库，`database_schema` 查看真实表结构，`database_execute` 确定性写入测试数据，`backend_logs` 查看测试后端日志。
- 数据写入会进入录制；第一个界面操作前连续的写入步骤导出到流程的 `初始化`，其余写入保持原顺序。参数使用合成固定值，避免随机值或当前时间造成回放差异；先重置再造数据，重置前的旧操作用 `record_remove` 排除。
- `browser_drag` 使用唯一 canvas 的定位及起点、终点 CSS 视口坐标拖动；两点必须落在画布和视口内。录制回放使用同一定位和坐标，布局或视口变化时需重新录制。
- `browser_request_hold` 挂起一次精确匹配的后端响应，`browser_request_wait` 等待响应取得，再通过 `browser_request_release` 释放。离开页面后还需等待可见的业务完成信号；挂起不会撤销后端副作用。
- `http_request` 请求当前测试后端的接口。管理员请求可用 `auth: 'test-admin'`，测试密码字段使用 `$test-password:<标签>`。
- `database_reset` 关闭浏览器会话、重置测试库并重启后端。默认保留操作记录，传入 `clearRecord: true` 可一并清空。
- `record_add_assertion` 用 `expected` 核对固定值，用 `expectedFrom: { sourceId, path }` 比较两次操作的结果。导出时，把断言引用的操作都放在断言前。
- `record_add_suggestion` 为录制操作记录建议，导出后随对应步骤进入报告。

### 操作后的图片观察与回放等待

浏览器界面动作默认自动观察（`observe: false` 可关闭）：动作后每秒采样、最多六秒，连续两次变化像素占比低于 1% 时结束；最多选三张差异帧，最终帧必选，按时间顺序直接返回给模型。灰度比较使用 100×100 缩图，返回图片为彩色 WebP，约 200 万像素目标且至少保留 CSS 逻辑尺寸，小图不放大。四周的刻度数字就是 CSS 视口操作坐标；证据图保持干净，`frames` 仅含 `elapsedMs`、`final`。主动 `browser_screenshot` 返回加刻度的原分辨率 PNG，便于看小字。

观察失败会返回 `observationError`，已经成功的动作仍记为成功，防止重复操作。采样只辅助判断下一步，回放使用明确的业务条件等待与断言；异步弹窗先等出现，关闭后再等隐藏。

坐标点击在动作前穿透 Shadow DOM 识别可点击元素，依次验证 aria-label、短文字、稳定 id/data 属性和祖先组合，唯一命中才采用。导出时改为按元素点击；没有定位且画面有足够纹理时，裁出落点附近约 64×64 的图片模板，复制到需求目录 `assets/<流程文件名>-<操作编号>.png`，用 `等待图片后点击` 回放。模板只在原坐标 ±120 单位内搜索，匹配至少 0.85 且领先次高分 0.05，超时明确报错；纯色区域沿用坐标，并自动记录改善元素标签的建议。

每个界面动作前后读取地址，变化时自动导出 `等待地址`。规范化保留 pathname 和 hash 路由，忽略 origin、查询串及 UUID/长随机编号，规则见 `src/model/web-locate/page-url.ts`。浏览器等待以 `/` 或 `#` 开头的地址时使用同一规则，其余写法继续交给 Playwright。图片观察不会导出成固定或稳定等待。

浏览器缺失时，开发套件与启动错误会提示运行 `pnpm exec playwright install chromium`，使用项目安装的 Playwright 版本。

### 退出后再回放

在另一个终端用 `TEST_DEV_READY` 中的 `stopId` 关闭同一实例。下面的命令会等待浏览器证据保存、服务停止和测试库锁释放。

```sh
node --import tsx scripts/test/dev-suite.ts --stop <stopId>
```

开发套件和回放共用 Web 测试库。等套件退出后再运行 `npm run test:requirement`。
