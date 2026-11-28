import type { 流程步骤附件 } from '../model/test-requirement'

/** 同一个错误从内层（操作）一路抛到外层（步骤）时，只在最内层留一次现场。 */
let 已取证错误们 = new WeakSet<object>()

/** 返回 true 表示这个错误还没取过证，并登记；非对象错误（字符串等）每次都取。 */
export function 登记失败取证(错误: unknown): boolean {
  if (错误 === null || typeof 错误 !== 'object') return true
  if (已取证错误们.has(错误)) return false
  已取证错误们.add(错误)
  return true
}

/** 失败现场附件：一张截图，加上有文字时的网页可见文字摘要。 */
export function 生成失败现场附件(参数: {
  图片Base64: string
  说明: string
  网页文字: { 文字: string } | { 原因: string }
  文字标题: string
}): 流程步骤附件[] {
  return [
    { 类型: '图片', 内容类型: 'image/webp', 内容: 参数.图片Base64, 说明: 参数.说明 },
    {
      类型: '文本' as const,
      内容:
        '文字' in 参数.网页文字
          ? `${参数.文字标题}\n${参数.网页文字.文字}`
          : `${参数.文字标题}（没有取到：${参数.网页文字.原因}）`,
    },
  ]
}
