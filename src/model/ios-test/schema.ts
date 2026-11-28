import { z } from 'zod'

import { 容忍空值 } from '../web-locate/probe'
import type { 苹果目标 } from './types'

let 元素字段 = {
  标签: z.string(),
  角色: 容忍空值(z.string()),
  名称: 容忍空值(z.string()),
  aria标签: 容忍空值(z.string()),
  文字: 容忍空值(z.string()),
  类名: 容忍空值(z.string()),
}
export let 点中元素模型 = z.preprocess(
  (值) => (值 === null ? undefined : 值),
  z.object({ ...元素字段, 内含: 容忍空值(z.object(元素字段)) }).optional(),
)
let 歧义匹配模型 = z.object({
  序号: z.number(),
  标签: z.string(),
  角色: 容忍空值(z.string()),
  名称: 容忍空值(z.string()),
  aria标签: 容忍空值(z.string()),
  文字: 容忍空值(z.string()),
  类名: 容忍空值(z.string()),
  选择器唯一: 容忍空值(z.boolean()),
})
export let 苹果目标模型 = z.object({
  按: z.enum(['文字', '描述', '标识', '网页文字', '网页选择器']),
  值: z.string().min(1),
  匹配: z.enum(['精确', '包含']).optional(),
})

/** 包含匹配只支持文字、描述和网页文字；选择器、标识不支持。 */
export function 检查包含匹配(目标: 苹果目标): void {
  if (目标.匹配 === '包含' && 目标.按 !== '文字' && 目标.按 !== '描述' && 目标.按 !== '网页文字')
    throw new Error(`${目标.按}不支持包含匹配，只有文字、描述、网页文字可以`)
}

/** 等待和断言用的目标：解析并检查包含匹配。 */
export function 解析等待目标(目标: 苹果目标): 苹果目标 {
  let 结果 = 苹果目标模型.parse(目标)
  检查包含匹配(结果)
  return 结果
}

/** 点击用的目标：不接受包含匹配，避免点错。 */
export function 解析点击目标(目标: 苹果目标): 苹果目标 {
  let 结果 = 苹果目标模型.parse(目标)
  if (结果.匹配 === '包含') throw new Error('点击不支持包含匹配，请用精确文字或选择器，避免点错')
  return 结果
}

export let 定位结果模型 = z.object({
  数量: z.number(),
  可见数量: z.number(),
  可点击: z.boolean(),
  禁用: z.boolean(),
  元素宽: z.number(),
  元素高: z.number(),
  x: z.number(),
  y: z.number(),
  宽: z.number(),
  高: z.number(),
  有限动画数: z.number().default(0),
  有无限动画: z.boolean().default(false),
  点中: 点中元素模型,
  盖住者: 点中元素模型,
  匹配们: 容忍空值(z.array(歧义匹配模型)),
})
export let 上下文模型 = z.array(z.object({ id: z.string(), url: z.string().nullish() }))
export let 元素标识模型 = z.object({ 'element-6066-11e4-a52e-4f735466cecf': z.string() })
export let 矩形模型 = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
