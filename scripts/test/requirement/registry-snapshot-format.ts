import { z } from 'zod'

export let 登记快照标记 = '@@需求登记快照@@'

/** 文件、描述文件都是相对 test/requirement 的 / 分隔路径；描述文件为 null 表示该需求不是来自 index.requirement.ts。 */
export let 登记快照模型 = z.strictObject({
  流程们: z.array(z.strictObject({ 名称: z.string(), 文件: z.string() })),
  /** 本次导出的需求描述文件：名称、验收点字典键（按原顺序）、业务需求的验收点个数。 */
  本需求: z.strictObject({ 名称: z.string(), 验收点键们: z.array(z.string()), 验收点数: z.number().int() }),
  需求们: z.array(z.strictObject({ 名称: z.string(), 描述文件: z.string().nullable() })),
})
export type 登记快照 = z.infer<typeof 登记快照模型>
