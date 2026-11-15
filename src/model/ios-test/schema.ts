import { z } from 'zod'

export let 苹果目标模型 = z.object({
  按: z.enum(['文字', '描述', '标识', '网页文字', '网页选择器']),
  值: z.string().min(1),
})
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
})
export let 上下文模型 = z.array(z.object({ id: z.string(), url: z.string().nullish() }))
export let 元素标识模型 = z.object({ 'element-6066-11e4-a52e-4f735466cecf': z.string() })
export let 矩形模型 = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
