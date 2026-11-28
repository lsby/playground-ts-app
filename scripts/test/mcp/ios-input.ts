import { z } from 'zod-mcp'

import type { 苹果目标 } from '../../../src/model/ios-test'
import { 匹配方式模型, 画面观察字段 } from './tool-input'

export let 苹果目标模型 = z.strictObject({
  by: z
    .enum(['text', 'description', 'identifier', 'webText', 'webSelector'])
    .describe(
      'Match a native iOS accessibility element (text = label or value, description = accessibility name, identifier = accessibilityIdentifier) or an element inside the app WebView.',
    ),
  value: z.string().min(1).describe('Exact text, name or identifier, or a CSS selector for webSelector.'),
})
export let 苹果观察字段 = 画面观察字段
export let 苹果打开模型 = z.strictObject({
  language: z
    .enum(['zh-CN', 'en-US'])
    .optional()
    .describe('Run the test app in this system language (default: the simulator language).'),
  ...苹果观察字段,
})
export let 苹果超时模型 = z.int().min(1).max(120_000).default(10_000).describe('Timeout in milliseconds.')
export let 苹果目标等待基础模型 = z.strictObject({ target: 苹果目标模型, timeoutMs: 苹果超时模型 })
export let 苹果目标操作模型 = z.strictObject({ target: 苹果目标模型, timeoutMs: 苹果超时模型, ...苹果观察字段 })
export let 苹果坐标模型 = z.strictObject({
  x: z
    .int()
    .nonnegative()
    .describe('X read from the ruler numbers on the top edge of the observation image (not an image pixel).'),
  y: z
    .int()
    .nonnegative()
    .describe('Y read from the ruler numbers on the left edge of the observation image (not an image pixel).'),
  ...苹果观察字段,
})
export let 苹果OCR点击模型 = z.strictObject({
  text: z.string().trim().min(1).describe('Exact visible text on the screenshot. Must match a single line.'),
  ...苹果观察字段,
})
export let 苹果滑动模型 = z.strictObject({
  x1: z.int().nonnegative().describe('Start X in points.'),
  y1: z.int().nonnegative().describe('Start Y in points.'),
  x2: z.int().nonnegative().describe('End X in points.'),
  y2: z.int().nonnegative().describe('End Y in points.'),
  durationMs: z.int().min(1).max(60_000).default(300),
  ...苹果观察字段,
})
export let 苹果输入模型 = z
  .strictObject({
    value: z
      .string()
      .describe(
        'Synthetic test data only. This value is recorded in plaintext. May be an empty string only when clear is true (just clears the field).',
      ),
    clear: z
      .boolean()
      .default(false)
      .describe(
        'false (default): append to the text already in the focused field. true: clear the focused field first, then type value; use it to overwrite text, to test an emptied field (value "") or to change numbers without concatenating.',
      ),
    ...苹果观察字段,
  })
  .superRefine((值, 上下文): void => {
    if (值.value === '' && 值.clear === false)
      上下文.addIssue({ code: 'custom', path: ['value'], message: 'value may be empty only when clear is true.' })
  })
export let 苹果仅观察开关模型 = z.strictObject({ ...苹果观察字段 })
export let 苹果系统弹框模型 = z.strictObject({
  action: z
    .enum(['accept', 'dismiss'])
    .describe('accept taps the allow-type button, dismiss taps the deny-type button.'),
  button: z.string().min(1).optional().describe('Exact button label to tap, for example 允许 or 不允许. Optional.'),
  ifPresent: z
    .boolean()
    .default(false)
    .describe(
      'true: do nothing when no alert appears (the permission was already decided, so replay will not fail); false: fail if no alert shows up.',
    ),
  ...苹果观察字段,
})
export let 苹果等待模型 = 苹果目标等待基础模型
  .extend({ state: z.enum(['visible', 'hidden']), match: 匹配方式模型 })
  .superRefine((值, 上下文): void => {
    if (值.match === 'contains' && ['text', 'description', 'webText'].includes(值.target.by) === false)
      上下文.addIssue({
        code: 'custom',
        path: ['match'],
        message: 'contains only works with text, description and webText.',
      })
  })
export let 苹果网络模型 = z.strictObject({
  state: z
    .enum(['online', 'offline', 'hang', 'maintenance', 'crash'])
    .describe(
      'online passes traffic through; offline behaves like airplane mode (connections are refused and existing ones dropped); hang accepts connections but never replies (poor signal); maintenance simulates the server being upgraded (nginx maintenance switch): preflight OPTIONS gets 204 and every other request, WebSocket upgrades included, gets 503 with a JSON body and CORS headers; crash simulates the main service being down (nginx cannot reach upstream): preflight OPTIONS gets 204 and every other request gets 502 with a JSON body (error code 服务暂时不可用) and CORS headers. The state survives ios_restart.',
    ),
})
export let 苹果配色模型 = z.strictObject({
  appearance: z.enum(['light', 'dark']).describe('Simulator system appearance. The WebView follows it.'),
  ...苹果观察字段,
})

/** 等待用的目标：match 为 contains 时带上 匹配: '包含'，精确匹配（默认）不加字段，保证已有录制和导出不变。 */
export function 转换苹果等待目标(参数: z.infer<typeof 苹果等待模型>): 苹果目标 {
  let 目标 = 转换苹果目标(参数.target)
  return 参数.match === 'contains' ? { ...目标, 匹配: '包含' } : 目标
}

export function 转换苹果目标(目标: z.infer<typeof 苹果目标模型>): 苹果目标 {
  switch (目标.by) {
    case 'text':
      return { 按: '文字', 值: 目标.value }
    case 'description':
      return { 按: '描述', 值: 目标.value }
    case 'identifier':
      return { 按: '标识', 值: 目标.value }
    case 'webText':
      return { 按: '网页文字', 值: 目标.value }
    case 'webSelector':
      return { 按: '网页选择器', 值: 目标.value }
  }
}
