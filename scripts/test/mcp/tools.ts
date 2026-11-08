import type {
  CallToolResult,
  JSONObject,
  McpServer,
  StandardSchemaWithJSON,
  ToolAnnotations,
} from '@modelcontextprotocol/server'
import { z } from 'zod-mcp'

import type { 测试服务日志内容, 需求测试工具 } from '../../../src/model/test-requirement'
import {
  会话模型,
  定位目标,
  无参数模型,
  查询模型,
  目标操作模型,
  编码数据库值,
  解码数据库参数,
  页面地址模型,
  页面模型,
} from './tool-input'

type MCP执行结果<T> = {
  结果: { 成功: true; 值: T } | { 成功: false; 错误: string }
  附件们: readonly { 路径: string; 说明?: string }[]
  取证错误们: readonly string[]
}
type 工具输出 = { 数据: JSONObject; 图片?: Buffer }

export type MCP测试工具宿主 = {
  执行: <T>(调用: (工具: 需求测试工具) => Promise<T>) => Promise<MCP执行结果<T>>
  获得测试地址: () => { 前端: string; 后端: string }
  读取后端日志: () => 测试服务日志内容
  获得输出目录: () => string
}

function 直接返回(数据: JSONObject): MCP执行结果<工具输出> {
  return { 结果: { 成功: true, 值: { 数据 } }, 附件们: [], 取证错误们: [] }
}

export function 注册测试工具(server: McpServer, 宿主: MCP测试工具宿主): void {
  let 注册 = <参数类型>(
    名称: string,
    描述: string,
    参数模型: StandardSchemaWithJSON<unknown, 参数类型>,
    执行: (参数: 参数类型) => Promise<MCP执行结果<工具输出>>,
    注解?: ToolAnnotations,
  ): void => {
    server.registerTool(
      名称,
      { description: 描述, inputSchema: 参数模型, ...(注解 === undefined ? {} : { annotations: 注解 }) },
      async (参数): Promise<CallToolResult> => {
        try {
          let { 结果, 附件们, 取证错误们 } = await 执行(参数)
          let artifacts = 附件们.map(({ 路径, 说明 }) => ({
            path: 路径,
            ...(说明 === undefined ? {} : { description: 说明 }),
          }))
          let structuredContent = {
            ...(结果.成功 ? { result: 结果.值.数据 } : { error: 结果.错误 }),
            artifacts,
            evidenceErrors: [...取证错误们],
          }
          let content: CallToolResult['content'] = [{ type: 'text', text: JSON.stringify(structuredContent) }]
          if (结果.成功 && 结果.值.图片 !== undefined)
            content.push({ type: 'image', data: 结果.值.图片.toString('base64'), mimeType: 'image/png' })
          return { content, structuredContent, ...(结果.成功 ? {} : { isError: true }) }
        } catch (错误) {
          let structuredContent = {
            error: 错误 instanceof Error ? 错误.message : String(错误),
            artifacts: [],
            evidenceErrors: [],
          }
          return {
            content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
            structuredContent,
            isError: true,
          }
        }
      },
    )
  }
  let 本地只读: ToolAnnotations = { readOnlyHint: true, openWorldHint: false }
  let 页面只读: ToolAnnotations = { readOnlyHint: true, openWorldHint: true }

  注册(
    'test_info',
    'Get the running test frontend and backend URLs and the local evidence directory.',
    无参数模型,
    async () => {
      let { 前端, 后端 } = 宿主.获得测试地址()
      return 直接返回({ baseUrl: 前端, backendUrl: 后端, outputDirectory: 宿主.获得输出目录() })
    },
    本地只读,
  )

  注册(
    'browser_open',
    'Open a named browser and optionally navigate to the running test frontend. If navigation fails, the browser stays open for inspection or retry.',
    页面模型.extend({ url: 页面地址模型.optional() }),
    ({ name, url, timeoutMs }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = await 工具.浏览器.打开(name)
        if (url !== undefined) await 引擎.导航(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' })
        return { 数据: { name, url: 引擎.获得地址() } }
      }),
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
    'Navigate a browser to a URL or a path relative to the running test frontend.',
    页面模型.extend({ url: 页面地址模型 }),
    ({ name, url, timeoutMs }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = 工具.浏览器.获得(name)
        let 响应 = await 引擎.导航(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' })
        return { 数据: { url: 引擎.获得地址(), status: 响应?.status() ?? null } }
      }),
  )

  注册('browser_reload', 'Reload the current page.', 页面模型, ({ name, timeoutMs }) =>
    宿主.执行(async (工具): Promise<工具输出> => {
      let 引擎 = 工具.浏览器.获得(name)
      let 响应 = await 引擎.重新加载({ timeout: timeoutMs, waitUntil: 'domcontentloaded' })
      return { 数据: { url: 引擎.获得地址(), status: 响应?.status() ?? null } }
    }),
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

  注册('browser_click', 'Click the element that matches a locator.', 目标操作模型, ({ name, target, timeoutMs }) =>
    宿主.执行(async (工具): Promise<工具输出> => {
      let 引擎 = 工具.浏览器.获得(name)
      await 引擎.点击(定位目标(引擎, target), { timeout: timeoutMs })
      return { 数据: { clicked: true } }
    }),
  )

  注册(
    'browser_click_at',
    'Click a point in the current viewport, in CSS pixels.',
    会话模型.extend({ x: z.number().nonnegative(), y: z.number().nonnegative() }),
    ({ name, x, y }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        await 工具.浏览器.获得(name).点击坐标(x, y)
        return { 数据: { clicked: true } }
      }),
  )

  注册(
    'browser_fill',
    'Fill a form control with text. Use an empty value to clear it.',
    目标操作模型.extend({ value: z.string() }),
    ({ name, target, value, timeoutMs }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = 工具.浏览器.获得(name)
        await 引擎.输入(定位目标(引擎, target), value, { timeout: timeoutMs })
        return { 数据: { filled: true } }
      }),
  )

  注册(
    'browser_press',
    'Send a keyboard key or chord to the focused page element, e.g. Enter or Control+a.',
    会话模型.extend({ key: z.string().trim().min(1) }),
    ({ name, key }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        await 工具.浏览器.获得(name).按键(key)
        return { 数据: { pressed: true } }
      }),
  )

  注册(
    'browser_select',
    'Select options of a native select control by their values.',
    目标操作模型.extend({ values: z.array(z.string()).min(1) }),
    ({ name, target, values, timeoutMs }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = 工具.浏览器.获得(name)
        let selected = await 引擎.选择(定位目标(引擎, target), values, { timeout: timeoutMs })
        return { 数据: { selected } }
      }),
  )

  注册('browser_check', 'Check a checkbox or radio button.', 目标操作模型, ({ name, target, timeoutMs }) =>
    宿主.执行(async (工具): Promise<工具输出> => {
      let 引擎 = 工具.浏览器.获得(name)
      await 引擎.勾选(定位目标(引擎, target), { timeout: timeoutMs })
      return { 数据: { checked: true } }
    }),
  )

  注册(
    'browser_screenshot',
    'Capture the current browser viewport and return a PNG image.',
    页面模型,
    ({ name, timeoutMs }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = 工具.浏览器.获得(name)
        let 图片 = await 引擎.截图(undefined, { timeout: timeoutMs })
        return { 数据: { url: 引擎.获得地址(), mimeType: 'image/png' }, 图片 }
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
    'database_query',
    'Run a parameterized read-only query against the project test database. Returns all rows unless maxRows is set.',
    查询模型,
    ({ sql, parameters, maxRows, evidenceColumns }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 结果 = 工具.数据库.查询(sql, parameters.map(解码数据库参数), evidenceColumns)
        let rows = 结果
          .slice(0, maxRows)
          .map((行) => Object.fromEntries(Object.entries(行).map(([列, 值]) => [列, 编码数据库值(值)])))
        return { 数据: { rows, rowCount: 结果.length, truncated: rows.length < 结果.length } }
      }),
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
