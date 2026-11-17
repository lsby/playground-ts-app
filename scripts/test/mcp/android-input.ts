import { z } from 'zod-mcp'

import type { 安卓目标 } from '../../../src/model/android-test'
import { 画面观察字段 } from './tool-input'

export let 安卓仅观察开关模型 = z.strictObject({ ...画面观察字段 })

export let 安卓目标模型 = z.strictObject({
  by: z
    .enum(['text', 'description', 'resourceId', 'webText', 'webSelector'])
    .describe('Match an Android accessibility property or an element inside the app WebView.'),
  value: z.string().min(1).describe('Exact text or resource ID, or a CSS selector for webSelector.'),
})
export let 安卓超时模型 = z.int().min(1).max(120_000).default(10_000).describe('Timeout in milliseconds.')
export let 安卓目标操作模型 = z.strictObject({ target: 安卓目标模型, timeoutMs: 安卓超时模型, ...画面观察字段 })
export let 安卓坐标模型 = z.strictObject({ x: z.int().nonnegative(), y: z.int().nonnegative(), ...画面观察字段 })
export let 安卓OCR点击模型 = z.strictObject({
  text: z.string().trim().min(1).describe('Exact visible text on the screenshot.'),
  ...画面观察字段,
})
export let 安卓滑动模型 = z.strictObject({
  x1: z.int().nonnegative(),
  y1: z.int().nonnegative(),
  x2: z.int().nonnegative(),
  y2: z.int().nonnegative(),
  durationMs: z.int().min(1).max(60_000).default(300),
  ...画面观察字段,
})
export let 安卓输入模型 = z.strictObject({
  value: z.string().min(1).describe('Synthetic ASCII test data only. This value is recorded in plaintext.'),
  ...画面观察字段,
})
export let 安卓等待模型 = z.strictObject({
  target: 安卓目标模型,
  timeoutMs: 安卓超时模型,
  state: z.enum(['visible', 'hidden']),
})
export let 安卓配色模型 = z.strictObject({ colorScheme: z.enum(['light', 'dark']), ...画面观察字段 })
export let 安卓打开模型 = z.strictObject({
  ...画面观察字段,
  allowNotificationPrompt: z
    .boolean()
    .optional()
    .describe(
      'Allow an unsettled notification permission only when testing the permission prompt. Never dismisses existing dialogs or changes permissions.',
    ),
})

export function 转换安卓目标(目标: z.infer<typeof 安卓目标模型>): 安卓目标 {
  switch (目标.by) {
    case 'text':
      return { 按: '文字', 值: 目标.value }
    case 'description':
      return { 按: '描述', 值: 目标.value }
    case 'resourceId':
      return { 按: '资源ID', 值: 目标.value }
    case 'webText':
      return { 按: '网页文字', 值: 目标.value }
    case 'webSelector':
      return { 按: '网页选择器', 值: 目标.value }
  }
}
