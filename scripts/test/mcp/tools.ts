import type { McpServer, ToolAnnotations } from '@modelcontextprotocol/server'
import { z } from 'zod-mcp'

import type { 提交步骤附件, 测试服务日志内容, 需求测试工具 } from '../../../src/model/test-requirement'
import { HTTP请求模型 } from '../../../src/test-tools/http-request'
import { 添加刻度边框 } from '../../../src/test-tools/observation-image'
import type { 测试操作记录 } from '../../../src/test-tools/operation-record'
import { 整理数据库写入结果, 整理数据库查询结果 } from '../../../src/test-tools/operation-values'
import { 注册安卓工具 } from './android-tools'
import { 注册浏览器拖动工具 } from './browser-drag-tool'
import { 执行浏览器操作并观察 } from './browser-observation'
import { 注册浏览器请求工具 } from './browser-request-tools'
import { 识别坐标点击 } from './click-enhance'
import { 注册苹果工具 } from './ios-tools'
import { 注册操作记录工具 } from './record-tools'
import { 创建工具注册器, 直接返回, type MCP执行结果, type 工具输出 } from './register-tool'
import {
  会话模型,
  写入模型,
  定位目标,
  无参数模型,
  查询模型,
  浏览器环境模型,
  浏览器观察参数模型,
  目标操作模型,
  表结构模型,
  解码数据库参数,
  页面地址模型,
  页面模型,
} from './tool-input'

export type MCP测试工具宿主 = {
  readonly 操作记录: 测试操作记录
  执行工具: <T>(调用: () => Promise<T>, 重置?: boolean) => Promise<T>
  重置数据库: (清空记录: boolean) => Promise<{ reset: true; recordCleared: boolean }>
  执行: (调用: (工具: 需求测试工具, 提交: 提交步骤附件) => Promise<工具输出>) => Promise<MCP执行结果<工具输出>>
  获得测试地址: () => { 前端: string; 后端: string }
  获得设备: () => { 安卓: string | undefined; 苹果: string | undefined }
  读取后端日志: () => 测试服务日志内容
  获得输出目录: () => string
}

export function 注册测试工具(server: McpServer, 宿主: MCP测试工具宿主): void {
  let 注册 = 创建工具注册器(server, (调用) => 宿主.执行工具(调用), 宿主.操作记录)
  let 注册无记录工具 = 创建工具注册器(server, (调用) => 宿主.执行工具(调用))
  注册安卓工具(注册, 宿主)
  注册浏览器请求工具(注册, 宿主)
  注册浏览器拖动工具(注册, 宿主)
  注册苹果工具(注册, 宿主)
  注册操作记录工具(注册无记录工具, 宿主.操作记录, () => 宿主.获得测试地址())
  let 注册重置工具 = 创建工具注册器(server, (调用) => 宿主.执行工具(调用, true))
  注册重置工具(
    'database_reset',
    'Reset the local test database and restart its backend. Closes all named browsers and preserves the operation record unless clearRecord is true. Reset itself is not recorded, and replay always starts from a clean database, so reset before seeding data; remove earlier operations with record_remove.',
    z.strictObject({ clearRecord: z.boolean().optional() }),
    async ({ clearRecord = false }) => 直接返回(await 宿主.重置数据库(clearRecord)),
    { destructiveHint: true, idempotentHint: false, openWorldHint: false },
  )
  let 本地只读: ToolAnnotations = { readOnlyHint: true, openWorldHint: false }
  let 页面只读: ToolAnnotations = { readOnlyHint: true, openWorldHint: true }
  let 观察说明 =
    ' On success, samples the screen until stable or six seconds and returns up to three selected WebP images in chronological order with capture times. Each image has a ruler border whose numbers are the click coordinates. Use these images to choose the next action. observe=false skips observation. Sampling does not establish business readiness; use browser_wait/browser_wait_url for recorded conditions. observationError means the action succeeded but observation failed.'

  注册无记录工具(
    'test_info',
    'Get the running test frontend and backend URLs and the local evidence directory.',
    无参数模型,
    async () => {
      let { 前端, 后端 } = 宿主.获得测试地址()
      return 直接返回({
        baseUrl: 前端,
        backendUrl: 后端,
        outputDirectory: 宿主.获得输出目录(),
        operationsPath: 宿主.操作记录.文件路径,
        androidDevice: 宿主.获得设备().安卓 ?? null,
        iosDevice: 宿主.获得设备().苹果 ?? null,
      })
    },
    本地只读,
  )

  注册(
    'browser_open',
    `Open a named browser and optionally navigate to the running test frontend. If navigation fails, the browser stays open for inspection or retry.${观察说明}`,
    页面模型.extend({ ...浏览器观察参数模型.shape, url: 页面地址模型.optional() }),
    ({ name, url, timeoutMs, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行浏览器操作并观察(
            工具,
            信号,
            name,
            async () => {
              let 引擎 = await 工具.浏览器.打开(name)
              if (url !== undefined) await 引擎.导航(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' })
              return { name, url: 引擎.获得地址() }
            },
            true,
            observe,
          ),
      ),
    { destructiveHint: false, openWorldHint: true },
  )

  注册(
    'browser_list',
    'List open named browser sessions.',
    无参数模型,
    () => 宿主.执行(async (工具): Promise<工具输出> => ({ 数据: { names: [...工具.浏览器.列出()] } })),
    本地只读,
  )

  注册('browser_close', 'Close a named browser session and archive its browser artifacts.', 会话模型, ({ name }) =>
    宿主.执行(async (工具): Promise<工具输出> => {
      await 工具.浏览器.关闭(name)
      return { 数据: { name, closed: true } }
    }),
  )

  注册(
    'browser_navigate',
    `Navigate a browser to a URL or a path relative to the running test frontend.${观察说明}`,
    页面模型.extend({ ...浏览器观察参数模型.shape, url: 页面地址模型 }),
    ({ name, url, timeoutMs, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行浏览器操作并观察(
            工具,
            信号,
            name,
            async () => {
              let 引擎 = 工具.浏览器.获得(name)
              let 响应 = await 引擎.导航(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' })
              return { url: 引擎.获得地址(), status: 响应?.status() ?? null }
            },
            false,
            observe,
          ),
      ),
  )

  注册(
    'browser_reload',
    `Reload the current page.${观察说明}`,
    页面模型.extend(浏览器观察参数模型.shape),
    ({ name, timeoutMs, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行浏览器操作并观察(
            工具,
            信号,
            name,
            async () => {
              let 引擎 = 工具.浏览器.获得(name)
              let 响应 = await 引擎.重新加载({ timeout: timeoutMs, waitUntil: 'domcontentloaded' })
              return { url: 引擎.获得地址(), status: 响应?.status() ?? null }
            },
            false,
            observe,
          ),
      ),
  )

  注册(
    'browser_environment',
    `Set the browser viewport, color scheme and reduced motion preference.${观察说明}`,
    会话模型.extend({ ...浏览器环境模型.shape, ...浏览器观察参数模型.shape }),
    ({ name, observe, ...参数 }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行浏览器操作并观察(
            工具,
            信号,
            name,
            async () => {
              await 工具.浏览器.获得(name).设置显示环境(参数)
              return { ...参数 }
            },
            false,
            observe,
          ),
      ),
  )

  注册(
    'browser_history',
    `Move actual browser history backward or forward.${观察说明}`,
    会话模型.extend({ ...浏览器观察参数模型.shape, direction: z.enum(['back', 'forward']) }),
    ({ name, direction, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行浏览器操作并观察(
            工具,
            信号,
            name,
            async () => {
              let 引擎 = 工具.浏览器.获得(name)
              await 引擎.移动浏览器历史(direction)
              return { url: 引擎.获得地址() }
            },
            false,
            observe,
          ),
      ),
  )

  注册(
    'browser_inspect_page',
    'Read the current page URL, title, and accessibility tree for choosing locators.',
    页面模型,
    ({ name, timeoutMs }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let { 地址, 标题, 页面结构 } = await 工具.浏览器.获得(name).观察页面({ timeout: timeoutMs })
        return { 数据: { url: 地址, title: 标题, tree: 页面结构 } }
      }),
    页面只读,
  )

  注册(
    'browser_inspect_target',
    'Count elements that match a locator and, for a unique match, report visibility and enabled state.',
    目标操作模型,
    ({ name, target, timeoutMs }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = 工具.浏览器.获得(name)
        let { 匹配数量, 可见, 可用 } = await 引擎.检查目标(定位目标(引擎, target), { timeout: timeoutMs })
        return {
          数据: {
            count: 匹配数量,
            ...(可见 === undefined ? {} : { visible: 可见 }),
            ...(可用 === undefined ? {} : { enabled: 可用 }),
          },
        }
      }),
    页面只读,
  )

  注册(
    'browser_click',
    `Click the element that matches a locator.${观察说明}`,
    目标操作模型.extend(浏览器观察参数模型.shape),
    ({ name, target, timeoutMs, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行浏览器操作并观察(
            工具,
            信号,
            name,
            async () => {
              let 引擎 = 工具.浏览器.获得(name)
              await 引擎.点击(定位目标(引擎, target), { timeout: timeoutMs })
              return { clicked: true }
            },
            false,
            observe,
            { 记录地址: true },
          ),
      ),
  )

  注册(
    'browser_click_at',
    `Click a point. Use the numbers on the ruler around the observation image as coordinates. Prefer locator-based or text-based click tools; coordinate clicks are only a fallback. Before tapping, the framework identifies the element under the point (through Shadow DOM) and exports an element-based click that waits for the element. When it cannot, it records a screenshot template (or the coordinate as a last resort) and adds a suggestion to give the element an aria-label; the response field locator says which.${观察说明}`,
    会话模型.extend({ ...浏览器观察参数模型.shape, x: z.number().nonnegative(), y: z.number().nonnegative() }),
    ({ name, x, y, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行浏览器操作并观察(
            工具,
            信号,
            name,
            async (上下文) => {
              let 引擎 = 工具.浏览器.获得(name)
              // 点击前先认出落点元素：能唯一定位就导出成按元素点击，认不出就用截图模板，再不行退回坐标
              await 识别坐标点击(
                上下文.增强,
                (落点x, 落点y) => 引擎.探测落点(落点x, 落点y),
                { x, y },
                上下文.操作前截图,
              )
              await 引擎.点击坐标(x, y)
              return { clicked: true }
            },
            false,
            observe,
            { 记录地址: true, 需要操作前截图: true },
          ),
      ),
  )

  注册(
    'browser_fill',
    `Fill a form control with text. Use an empty value to clear it.${观察说明}`,
    目标操作模型.extend({ ...浏览器观察参数模型.shape, value: z.string() }),
    ({ name, target, value, timeoutMs, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行浏览器操作并观察(
            工具,
            信号,
            name,
            async () => {
              let 引擎 = 工具.浏览器.获得(name)
              await 引擎.输入(定位目标(引擎, target), value, { timeout: timeoutMs })
              return { filled: true }
            },
            false,
            observe,
            { 记录地址: true },
          ),
      ),
  )

  注册(
    'browser_press',
    `Send a keyboard key or chord to the focused page element, e.g. Enter or Control+a.${观察说明}`,
    会话模型.extend({ ...浏览器观察参数模型.shape, key: z.string().trim().min(1) }),
    ({ name, key, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行浏览器操作并观察(
            工具,
            信号,
            name,
            async () => {
              await 工具.浏览器.获得(name).按键(key)
              return { pressed: true }
            },
            false,
            observe,
            { 记录地址: true },
          ),
      ),
  )

  注册(
    'browser_select',
    `Select options of a native select control by their values.${观察说明}`,
    目标操作模型.extend({ ...浏览器观察参数模型.shape, values: z.array(z.string()).min(1) }),
    ({ name, target, values, timeoutMs, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行浏览器操作并观察(
            工具,
            信号,
            name,
            async () => {
              let 引擎 = 工具.浏览器.获得(name)
              let selected = await 引擎.选择(定位目标(引擎, target), values, { timeout: timeoutMs })
              return { selected }
            },
            false,
            observe,
            { 记录地址: true },
          ),
      ),
  )

  注册(
    'browser_check',
    `Check a checkbox or radio button.${观察说明}`,
    目标操作模型.extend(浏览器观察参数模型.shape),
    ({ name, target, timeoutMs, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行浏览器操作并观察(
            工具,
            信号,
            name,
            async () => {
              let 引擎 = 工具.浏览器.获得(name)
              await 引擎.勾选(定位目标(引擎, target), { timeout: timeoutMs })
              return { checked: true }
            },
            false,
            observe,
            { 记录地址: true },
          ),
      ),
  )

  注册(
    'browser_screenshot',
    'Capture the current browser viewport and return a fresh PNG image.',
    页面模型,
    ({ name, timeoutMs }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = 工具.浏览器.获得(name)
        let 图片 = await 引擎.截图(undefined, { timeout: timeoutMs })
        return {
          数据: { url: 引擎.获得地址(), mimeType: 'image/png' },
          图片们: [
            {
              图片,
              模型图片: (await 添加刻度边框(图片, 图片.readUInt32BE(16), 图片.readUInt32BE(20), 'png')).图片,
              内容类型: 'image/png',
              说明: `${name} · 请求的截图 · 四周刻度数字就是点击坐标`,
            },
          ],
        }
      }),
    页面只读,
  )

  注册(
    'browser_wait',
    'Wait for a locator to become visible or hidden. Fails on timeout.',
    目标操作模型.extend({ state: z.enum(['visible', 'hidden']) }),
    ({ name, target, state, timeoutMs }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = 工具.浏览器.获得(name)
        let 定位 = 定位目标(引擎, target)
        switch (state) {
          case 'visible':
            await 引擎.验证可见(定位, { timeout: timeoutMs })
            break
          case 'hidden':
            await 引擎.验证隐藏(定位, { timeout: timeoutMs })
            break
        }
        return { 数据: { state } }
      }),
    页面只读,
  )

  注册(
    'browser_wait_url',
    'Wait for a page URL to match a literal URL or a Playwright glob pattern.',
    页面模型.extend({ pattern: z.string().trim().min(1) }),
    ({ name, pattern, timeoutMs }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = 工具.浏览器.获得(name)
        await 引擎.等待地址(pattern, { timeout: timeoutMs, waitUntil: 'domcontentloaded' })
        return { 数据: { url: 引擎.获得地址() } }
      }),
    页面只读,
  )

  注册(
    'http_request',
    'Send a recorded GET or JSON POST to the current local Web test backend. Returns HTTP status, ok, and the redacted JSON body (or null for an empty or non-JSON response). Redirects are never followed. Use only synthetic test data. For an administrator request pass auth: test-admin; for a test password use $test-password:<label> in the JSON field.',
    HTTP请求模型,
    (参数, 取消信号) => 宿主.执行(async (工具): Promise<工具输出> => ({ 数据: await 工具.HTTP.请求(参数, 取消信号) })),
    { destructiveHint: true, openWorldHint: false },
  )

  注册(
    'database_query',
    'Run a parameterized read-only query against the project test database. Returns all rows unless maxRows is set.',
    查询模型,
    ({ sql, parameters, maxRows, evidenceColumns }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 结果 = 工具.数据库.查询(sql, parameters.map(解码数据库参数), evidenceColumns)
        return { 数据: 整理数据库查询结果(结果, maxRows) }
      }),
    本地只读,
  )

  注册(
    'database_execute',
    'Run one parameterized INSERT, UPDATE or DELETE against the project test database, to seed data the UI cannot reach (history days, special states). Prefer the UI or API when they produce the data naturally. Statements must be deterministic: no random values, no current time for key data. Exported automatically: writes before the first UI or device operation become the flow initialization, later ones become an action step. Returns changes and, for INSERT, lastInsertRowid. Check results with database_query; look up table structure with database_schema.',
    写入模型,
    ({ sql, parameters }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 结果 = 工具.数据库.执行(sql, parameters.map(解码数据库参数))
        return { 数据: 整理数据库写入结果(结果) }
      }),
    { destructiveHint: true, idempotentHint: false, openWorldHint: false },
  )

  注册无记录工具(
    'database_schema',
    'Read the real structure of the project test database: for each table its columns (name, type, not null, primary key position, default) and foreign keys. Pass tables to see only some. Not recorded, so it never affects replay. Use it instead of reading source files.',
    表结构模型,
    ({ tables }) =>
      宿主.执行(
        async (工具): Promise<工具输出> => ({
          数据: {
            tables: 工具.数据库
              .表结构(tables)
              .map(({ 表, 列们, 外键们 }) => ({
                name: 表,
                columns: 列们.map(({ 列, 类型, 非空, 主键序号, 默认值 }) => ({
                  name: 列,
                  type: 类型,
                  notNull: 非空,
                  primaryKey: 主键序号,
                  default: 默认值,
                })),
                foreignKeys: 外键们.map(({ 列, 引用表, 引用列, 更新时, 删除时 }) => ({
                  column: 列,
                  referencesTable: 引用表,
                  referencesColumn: 引用列,
                  onUpdate: 更新时,
                  onDelete: 删除时,
                })),
              })),
          },
        }),
      ),
    本地只读,
  )

  注册(
    'backend_logs',
    'Read recent stdout and stderr from the running local test server.',
    无参数模型,
    async () => {
      let { 标准输出, 错误输出 } = 宿主.读取后端日志()
      return 直接返回({ stdout: 标准输出, stderr: 错误输出 })
    },
    本地只读,
  )
}
