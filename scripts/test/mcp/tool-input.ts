import type { Locator } from '@playwright/test'
import { z } from 'zod-mcp'

import type { 浏览器测试引擎 } from '../../../src/model/browser-test'
import type { 测试数据库值 } from '../../../src/model/test-requirement'

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
let 目标模型 = z.discriminatedUnion('by', [
  z.strictObject({ by: z.literal('role'), role: 角色模型, name: z.string().optional(), exact: 精确, index: 索引 }),
  z.strictObject({ by: z.literal('text'), text: z.string().min(1), exact: 精确, index: 索引 }),
  z.strictObject({ by: z.literal('label'), label: z.string().min(1), exact: 精确, index: 索引 }),
  z.strictObject({ by: z.literal('selector'), selector: z.string().trim().min(1), index: 索引 }),
])
type 目标描述 = z.infer<typeof 目标模型>

export let 无参数模型 = z.strictObject({})
export let 会话模型 = z.strictObject({ name: z.string().trim().min(1).max(100).describe('Named browser session.') })
let 超时模型 = z.int().min(1).default(5_000).describe('Timeout in milliseconds. Defaults to 5000.')
export let 页面模型 = 会话模型.extend({ timeoutMs: 超时模型 })
export let 目标操作模型 = 页面模型.extend({ target: 目标模型 })
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
  let 目标: Locator
  switch (描述.by) {
    case 'role':
      目标 = 引擎.按角色(描述.role, {
        ...(描述.name === undefined ? {} : { name: 描述.name }),
        ...(描述.exact === undefined ? {} : { exact: 描述.exact }),
      })
      break
    case 'text':
      目标 = 引擎.按文本(描述.text, 描述.exact === undefined ? undefined : { exact: 描述.exact })
      break
    case 'label':
      目标 = 引擎.按标签(描述.label, 描述.exact === undefined ? undefined : { exact: 描述.exact })
      break
    case 'selector':
      目标 = 引擎.定位(描述.selector)
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
type 数据库参数 = z.infer<typeof 数据库参数模型>

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
