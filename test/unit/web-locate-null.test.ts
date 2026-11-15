import { describe, expect, it } from 'vitest'

import { 整理落点结果 } from '../../src/model/web-locate/probe'

describe('iOS 页面脚本返回 null 字段', () => {
  it('落点结果里值为 undefined 的字段被 iOS 变成 null 时仍能识别', async () => {
    let 原始结果 = {
      命中: { 标签: 'img', 类名: null },
      目标: {
        标签: 'button',
        类名: 'btn',
        id: null,
        角色: null,
        aria标签: '收下礼物',
        文字: null,
        数据属性们: [],
        祖先: null,
      },
    }
    let 结果 = await 整理落点结果(原始结果, async (候选们) => 候选们[0])
    expect(结果.状态).toBe('已识别')
  })

  it('命中和目标本身为 null 仍然表示没有元素', async () => {
    let 验证 = async (): Promise<undefined> => undefined
    expect(await 整理落点结果({ 命中: null, 目标: null }, 验证)).toMatchObject({ 状态: '无定位', 命中: '页面之外' })
    expect(await 整理落点结果({ 命中: { 标签: 'div', 类名: null }, 目标: null }, 验证)).toMatchObject({
      状态: '无定位',
    })
  })
})
