import type { Locator } from '@playwright/test'
import { z } from 'zod-mcp'

import type { 浏览器测试引擎 } from '../../../src/model/browser-test'
import type { 测试数据库值 } from '../../../src/model/test-requirement'

export let 浏览器环境模型 = z.object({
  width: z.number().int().min(240).max(3840),
  height: z.number().int().min(320).max(2160),
  colorScheme: z.enum(['light', 'dark']),
  reducedMotion: z.enum(['reduce', 'no-preference']),
})

export let 画面观察字段 = {
  observe: z
    .boolean()
    .default(true)
    .describe(
      'Sample the screen until stable or six seconds and return up to three selected WebP images proportionally resized toward 2MP with logical-pixel readability floors (and a 720px short-edge floor on phones). Default true; false skips observation. Use explicit waits for business readiness.',
    ),
}
export let 浏览器观察参数模型 = z.strictObject({ ...画面观察字段 })

let 角色模型 = z.enum([
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'blockquote',
  'button',
  'caption',
  'cell',
  'checkbox',
  'code',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'deletion',
  'dialog',
  'directory',
  'document',
  'emphasis',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'insertion',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'meter',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'strong',
  'subscript',
  'superscript',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'time',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
])
let 索引 = z.int().nonnegative().optional().describe('Zero-based index when the locator matches multiple elements.')
let 精确 = z.boolean().optional().describe('Match the full name, text, or label case-sensitively.')
let 基础目标模型 = z.discriminatedUnion('by', [
  z.strictObject({ by: z.literal('role'), role: 角色模型, name: z.string().optional(), exact: 精确, index: 索引 }),
  z.strictObject({ by: z.literal('text'), text: z.string().min(1), exact: 精确, index: 索引 }),
  z.strictObject({ by: z.literal('label'), label: z.string().min(1), exact: 精确, index: 索引 }),
  z.strictObject({ by: z.literal('selector'), selector: z.string().trim().min(1), index: 索引 }),
])
let 限定范围 = {
  within: 基础目标模型
    .optional()
    .describe('Scope the target to one unique region, dialog, or container. No nested within.'),
}
let 目标模型 = z.discriminatedUnion('by', [
  基础目标模型.options[0].extend(限定范围),
  基础目标模型.options[1].extend(限定范围),
  基础目标模型.options[2].extend(限定范围),
  基础目标模型.options[3].extend(限定范围),
])
export type 目标描述 = z.infer<typeof 目标模型>

export let 无参数模型 = z.strictObject({})
export let 会话模型 = z.strictObject({ name: z.string().trim().min(1).max(100).describe('Named browser session.') })
let 超时模型 = z.int().min(1).default(10_000).describe('Timeout in milliseconds. Defaults to 10000.')
export let 页面模型 = 会话模型.extend({ timeoutMs: 超时模型 })
export let 浏览器请求标识模型 = 会话模型.extend({ requestId: z.string().trim().min(1).max(100) })
export let 浏览器挂起请求模型 = 浏览器请求标识模型.extend({
  path: z.string().trim().min(1),
  bodyMatch: z
    .record(z.string().min(1), z.string())
    .refine((值) => Object.keys(值).length > 0, 'bodyMatch requires at least one exact string field.'),
})
export let 浏览器等待请求模型 = 浏览器请求标识模型.extend({
  state: z.enum(['captured', 'response-ready', 'finished']),
  timeoutMs: 超时模型,
})
export let 浏览器释放请求模型 = 浏览器请求标识模型.extend({ timeoutMs: 超时模型 })
export let 目标操作模型 = 页面模型.extend({ target: 目标模型 })
let 拖动坐标模型 = z.strictObject({ x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative() })
export let 浏览器拖动模型 = 目标操作模型.extend({ source: 拖动坐标模型, destination: 拖动坐标模型 })
export let 页面地址模型 = z
  .string()
  .trim()
  .min(1)
  .refine((地址) => {
    let 基础地址 = 'http://localhost'
    if (URL.canParse(地址, 基础地址) === false) return false
    let { protocol } = new URL(地址, 基础地址)
    return protocol === 'http:' || protocol === 'https:' || 地址 === 'about:blank'
  }, 'Expected a relative path, HTTP(S) URL, or about:blank.')
  .describe('HTTP(S) URL, path relative to the local test server, or about:blank.')

export function 定位目标(引擎: 浏览器测试引擎, 描述: 目标描述): Locator {
  return 定位范围内目标(描述.within === undefined ? 引擎 : 定位范围内目标(引擎, 描述.within), 描述)
}

function 定位范围内目标(引擎: 浏览器测试引擎 | Locator, 描述: z.infer<typeof 基础目标模型>): Locator {
  let 目标: Locator
  switch (描述.by) {
    case 'role':
      目标 = ('按角色' in 引擎 ? 引擎.按角色.bind(引擎) : 引擎.getByRole.bind(引擎))(描述.role, {
        ...(描述.name === undefined ? {} : { name: 描述.name }),
        ...(描述.exact === undefined ? {} : { exact: 描述.exact }),
      })
      break
    case 'text':
      目标 = ('按文本' in 引擎 ? 引擎.按文本.bind(引擎) : 引擎.getByText.bind(引擎))(
        描述.text,
        描述.exact === undefined ? undefined : { exact: 描述.exact },
      )
      break
    case 'label':
      目标 = ('按标签' in 引擎 ? 引擎.按标签.bind(引擎) : 引擎.getByLabel.bind(引擎))(
        描述.label,
        描述.exact === undefined ? undefined : { exact: 描述.exact },
      )
      break
    case 'selector':
      目标 = '定位' in 引擎 ? 引擎.定位(描述.selector) : 引擎.locator(描述.selector)
      break
  }
  return 描述.index === undefined ? 目标 : 目标.nth(描述.index)
}

let 整数模式 = /^-?(?:0|[1-9]\d*)$/
let 数据库参数模型 = z.union([
  z.string(),
  z.number(),
  z.null(),
  z.strictObject({
    type: z.literal('bigint'),
    value: z
      .string()
      .max(20)
      .regex(整数模式)
      .refine((值) => {
        if (值.length > 20 || 整数模式.test(值) === false) return false
        let 整数 = BigInt(值)
        return 整数 >= -9_223_372_036_854_775_808n && 整数 <= 9_223_372_036_854_775_807n
      }, 'Expected a signed 64-bit integer.'),
  }),
  z.strictObject({ type: z.literal('blob'), value: z.base64() }),
])
export type 数据库参数 = z.infer<typeof 数据库参数模型>

export let 查询模型 = z.strictObject({
  sql: z.string().trim().min(1).describe('A single read-only SQL query. Use ? placeholders for data.'),
  parameters: z
    .array(数据库参数模型)
    .default([])
    .describe('Parameters, including typed bigint and base64 blob objects.'),
  maxRows: z.int().min(1).optional().describe('Optional limit on rows in the response.'),
  evidenceColumns: z
    .array(z.string().min(1))
    .optional()
    .describe('Public column names to include in the saved evidence.'),
})

export let 写入模型 = z.strictObject({
  sql: z
    .string()
    .trim()
    .min(1)
    .describe(
      'A single INSERT, UPDATE or DELETE statement for the test database. Use ? placeholders for data. It must be deterministic: no random values and no current time for key data; derive dates from the business day.',
    ),
  parameters: 查询模型.shape.parameters,
})

export let 表结构模型 = z.strictObject({
  tables: z.array(z.string().min(1)).min(1).optional().describe('Only these tables. Omit to list every table.'),
})

export function 解码数据库参数(值: 数据库参数): 测试数据库值 {
  if (值 === null || typeof 值 !== 'object') return 值
  switch (值.type) {
    case 'bigint':
      return BigInt(值.value)
    case 'blob':
      return Buffer.from(值.value, 'base64')
  }
}

export function 编码数据库值(值: 测试数据库值): 数据库参数 {
  if (typeof 值 === 'bigint') return { type: 'bigint', value: String(值) }
  if (值 instanceof Uint8Array) return { type: 'blob', value: Buffer.from(值).toString('base64') }
  if (typeof 值 === 'number' && Number.isFinite(值) === false)
    throw new Error('The query returned a numeric value that cannot be represented in JSON.')
  return 值
}
