import { z } from 'zod-mcp'

import type { 苹果目标 } from '../../../src/model/ios-test'
import { 画面观察字段 } from './tool-input'

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
  x: z.int().nonnegative().describe('X from the ruler numbers on the observation image.'),
  y: z.int().nonnegative().describe('Y from the ruler numbers on the observation image.'),
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
export let 苹果输入模型 = z.strictObject({
  value: z.string().min(1).describe('Synthetic test data only. This value is recorded in plaintext.'),
  ...苹果观察字段,
})
export let 苹果仅观察开关模型 = z.strictObject({ ...苹果观察字段 })
export let 苹果等待模型 = 苹果目标等待基础模型.extend({ state: z.enum(['visible', 'hidden']) })
export let 苹果网络模型 = z.strictObject({
  state: z
    .enum(['online', 'offline', 'hang'])
    .describe(
      'online passes traffic through; offline behaves like airplane mode (connections are refused and existing ones dropped); hang accepts connections but never replies (poor signal). The state survives ios_restart.',
    ),
})
export let 苹果配色模型 = z.strictObject({
  appearance: z.enum(['light', 'dark']).describe('Simulator system appearance. The WebView follows it.'),
  ...苹果观察字段,
})

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
