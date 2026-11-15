import type { 苹果界面元素 } from './types'

/** 把 Appium 的页面源码（XML）精简成元素列表：只保留有文字、名称或可交互的元素。 */
export function 解析苹果界面(源码: string): 苹果界面元素[] {
  let 结果: 苹果界面元素[] = []
  let 属性 = (标签: string, 名: string): string =>
    (new RegExp(`\\s${名}="([^"]*)"`, 'u').exec(标签)?.[1] ?? '')
      .replaceAll('&quot;', '"')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&')
  for (let 匹配 of 源码.matchAll(/<(XCUIElementType\w+)\s[^>]*>/gu)) {
    let 标签 = 匹配[0]
    let 类型 = (匹配[1] ?? '').replace('XCUIElementType', '')
    let 标签文字 = 属性(标签, 'label')
    let 值 = 属性(标签, 'value')
    let 名称 = 属性(标签, 'name')
    let 文字 = 标签文字 !== '' ? 标签文字 : 值
    if (
      文字 === '' &&
      名称 === '' &&
      ['Button', 'TextField', 'SecureTextField', 'Switch', 'Link', 'Cell', 'Tab'].includes(类型) === false
    )
      continue
    let 宽 = Number(属性(标签, 'width'))
    let 高 = Number(属性(标签, 'height'))
    结果.push({
      类型,
      文字,
      名称,
      标识: 名称 !== '' && 名称 !== 标签文字 ? 名称 : '',
      位置: { x: Number(属性(标签, 'x')), y: Number(属性(标签, 'y')), 宽, 高 },
      可见: 属性(标签, 'visible') === 'true' && 宽 > 0 && 高 > 0,
    })
  }
  return 结果
}
