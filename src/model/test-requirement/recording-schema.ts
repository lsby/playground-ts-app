import { z } from 'zod'

import { JSON值模式, JSON对象模式 } from '../data/json-value'
import { 测试建议模型 } from './model'

let 编号模型 = z.number().int().positive().safe()
let 时间模型 = z.string().datetime()
let 路径模型 = z.array(z.union([z.string(), z.number().int().nonnegative().safe()]))
let 基本字段 = {
  id: 编号模型,
  notes: z.string().nullable(),
  decision: z.string().nullable().optional(),
  suggestions: z.array(测试建议模型).optional(),
}
let 点模型 = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
let 增强模型 = z
  .object({
    定位: z
      .object({ 种类: z.enum(['选择器', '文字']), 值: z.string(), 说明: z.string() })
      .strict()
      .optional(),
    地址变化: z.object({ 前: z.string(), 后: z.string() }).strict().optional(),
    地址读取错误: z.string().optional(),
    模板: z.object({ 文件: z.string(), 比例: z.number().positive(), 原坐标: 点模型, 落点: 点模型 }).strict().optional(),
  })
  .strict()
let 调用字段 = {
  ...基本字段,
  kind: z.literal('call'),
  tool: z.string().min(1),
  arguments: JSON对象模式,
  start: 时间模型,
  增强: 增强模型.optional(),
  invalid: z
    .object({ reason: z.string().min(1), at: 时间模型 })
    .strict()
    .optional(),
  confirmed: z.boolean().optional(),
}
let 完成字段 = {
  end: 时间模型,
  artifacts: z.array(z.object({ path: z.string(), description: z.string().optional() }).strict()),
  evidenceErrors: z.array(z.string()),
}
let 调用模型 = z.discriminatedUnion('status', [
  z.object({ ...调用字段, status: z.literal('pending') }).strict(),
  z.object({ ...调用字段, ...完成字段, status: z.literal('passed'), result: JSON对象模式 }).strict(),
  z
    .object({
      ...调用字段,
      ...完成字段,
      status: z.literal('failed'),
      error: z.string(),
      failurePhase: z.enum(['before-action', 'after-action']).optional(),
    })
    .strict(),
])
let 断言字段 = {
  ...基本字段,
  kind: z.literal('assertion'),
  sourceId: 编号模型,
  path: 路径模型,
  operator: z.literal('deepEqual'),
  mergeWithPreviousAttachmentGroup: z.boolean().optional(),
  createdAt: 时间模型,
}
let 断言模型 = z.union([
  z.object({ ...断言字段, expected: JSON值模式, expectedFrom: z.never().optional() }).strict(),
  z
    .object({
      ...断言字段,
      expected: z.never().optional(),
      expectedFrom: z.object({ sourceId: 编号模型, path: 路径模型 }).strict(),
    })
    .strict(),
])
let 条目模型 = z.union([
  调用模型,
  断言模型,
  z.object({ ...基本字段, kind: z.literal('manual'), description: z.string(), createdAt: 时间模型 }).strict(),
])

/** 只读取完整的第 4 版录制；旧文件须重新录制，读取时逐项校验。 */
export let 操作记录文档模型 = z
  .object({
    version: z.literal(4),
    exportedAt: 时间模型.optional(),
    nextId: 编号模型,
    entries: z.array(条目模型),
    replaySteps: z.array(z.object({ 名称: z.string().optional(), 条目编号们: z.array(编号模型) }).strict()),
    notes: z.array(z.object({ id: 编号模型, operationIds: z.array(编号模型), text: z.string() }).strict()),
  })
  .strict()
  .superRefine((文档, 上下文): void => {
    let 条目们 = new Map(文档.entries.map((条目) => [条目.id, 条目]))
    let 全部编号们 = [...文档.entries, ...文档.notes].map(({ id }) => id)
    if (new Set(全部编号们).size !== 全部编号们.length || 全部编号们.some((编号) => 编号 >= 文档.nextId))
      上下文.addIssue({ code: 'custom', message: '录制条目和备注编号必须唯一且小于 nextId' })
    for (let 备注 of 文档.notes) {
      if (备注.operationIds.length === 0 || new Set(备注.operationIds).size !== 备注.operationIds.length)
        上下文.addIssue({ code: 'custom', message: `备注 #${String(备注.id)} 的操作编号必须非空且唯一` })
      if (备注.operationIds.some((编号) => 条目们.has(编号) === false))
        上下文.addIssue({ code: 'custom', message: `备注 #${String(备注.id)} 引用了不存在的录制条目` })
    }
    for (let 条目 of 文档.entries) {
      if (条目.kind !== 'assertion') continue
      let 来源们 = [条目.sourceId, ...(条目.expectedFrom === undefined ? [] : [条目.expectedFrom.sourceId])]
      for (let 编号 of 来源们) {
        let 来源 = 条目们.get(编号)
        if (来源?.kind !== 'call' || 来源.status !== 'passed')
          上下文.addIssue({
            code: 'custom',
            message: `断言 #${String(条目.id)} 的来源 #${String(编号)} 必须是成功的工具调用`,
          })
      }
    }
    let 已选编号们 = new Set<number>()
    for (let 步骤 of 文档.replaySteps) {
      if (步骤.条目编号们.length === 0) 上下文.addIssue({ code: 'custom', message: '回放步骤必须包含操作' })
      for (let 编号 of 步骤.条目编号们) {
        let 条目 = 条目们.get(编号)
        if (条目 === undefined || 条目.kind === 'manual' || 已选编号们.has(编号))
          上下文.addIssue({ code: 'custom', message: `回放编号 #${String(编号)} 必须存在、可回放且只能选择一次` })
        if (条目?.kind === 'assertion') {
          let 来源们 = [条目.sourceId, ...(条目.expectedFrom === undefined ? [] : [条目.expectedFrom.sourceId])]
          if (来源们.some((来源) => 已选编号们.has(来源) === false))
            上下文.addIssue({ code: 'custom', message: `回放断言 #${String(编号)} 的来源必须在断言之前` })
        }
        已选编号们.add(编号)
      }
    }
  })
