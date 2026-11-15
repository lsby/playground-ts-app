import type { 苹果目标 } from './types'

/** 把原生目标转成 XCUITest 的谓词字符串；网页目标不能用于原生界面树。 */
export function 生成原生谓词(目标: 苹果目标): string {
  let 值 = 目标.值.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  switch (目标.按) {
    case '文字':
      return `label == "${值}" OR value == "${值}"`
    case '描述':
      return `name == "${值}"`
    case '标识':
      return `name == "${值}" AND label != "${值}"`
    case '网页文字':
    case '网页选择器':
      throw new Error('网页目标不能用于 iOS 原生界面树')
  }
}
