import { z } from 'zod'

import { 描述元素, 描述命中元素, 生成定位候选, type 元素描述, type 定位候选, type 落点探测结果 } from './candidates'

/** iOS（Safari WebDriver）会把页面脚本返回对象里值为 undefined 的字段变成 null，Chrome 则直接省略；统一当作没有这个字段。 */
export function 容忍空值<T extends z.ZodType>(
  模型: T,
): z.ZodEffects<z.ZodOptional<T>, z.output<T> | undefined, unknown> {
  return z.preprocess((值) => (值 === null ? undefined : 值), 模型.optional())
}

let 描述模型 = z.object({
  标签: z.string(),
  类名: 容忍空值(z.string()),
  id: 容忍空值(z.string()),
  角色: 容忍空值(z.string()),
  aria标签: 容忍空值(z.string()),
  文字: 容忍空值(z.string()),
  数据属性们: 容忍空值(z.array(z.object({ 名: z.string(), 值: z.string() }))),
  祖先: 容忍空值(z.object({ 标签: z.string(), aria标签: z.string() })),
})
let 落点结果模型 = z.object({
  命中: z.object({ 标签: z.string(), 类名: 容忍空值(z.string()) }).nullable(),
  目标: 描述模型.nullable(),
})
export let 视口模型 = z.object({ 宽: z.number(), 高: z.number() })

/**
 * 把页面里落点脚本的原始返回整理成识别结果。
 * `验证` 由各引擎用自己真实的定位方式实现：返回第一个「只匹配到一个，而且就是落点元素」的候选。
 */
export async function 整理落点结果(
  原始结果: unknown,
  验证: (候选们: readonly 定位候选[]) => Promise<定位候选 | undefined>,
): Promise<落点探测结果> {
  let 结果 = 落点结果模型.parse(原始结果)
  if (结果.命中 === null) return { 状态: '无定位', 原因: '落点没有页面元素', 命中: '页面之外' }
  if (结果.目标 === null) return { 状态: '无定位', 原因: '落点没有可点击的元素', 命中: 描述命中元素(结果.命中) }
  let 描述: 元素描述 = 结果.目标
  let 通过 = await 验证(生成定位候选(描述))
  if (通过 === undefined)
    return { 状态: '无定位', 原因: '没有能唯一指向它的定位', 命中: `${描述元素(描述)} ${描述命中元素(结果.目标)}` }
  return { 状态: '已识别', 定位: { 种类: 通过.种类, 值: 通过.值 }, 说明: 描述元素(描述) }
}
