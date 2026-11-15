import { describe, expect, it } from 'vitest'

import { 安卓配色模型 } from '../../scripts/test/mcp/android-input'
import { 生成安卓调用代码 } from '../../scripts/test/requirement/android-operation-code'
import type { JSON对象, 操作调用条目 } from '../../src/test-tools/operation-record'

function 生成条目(参数: JSON对象): 操作调用条目 {
  return {
    id: 7,
    notes: null,
    kind: 'call',
    tool: 'android_appearance',
    arguments: 参数,
    start: '2026-11-14T00:00:00.000Z',
    status: 'pending',
  }
}

describe('Android 配色工具参数与导出', () => {
  it.each(['light', 'dark'])('导出 %s 使用同一引擎方法并保留结果', (colorScheme): void => {
    expect(安卓配色模型.parse({ colorScheme })).toEqual({ colorScheme, observe: true })
    expect(生成安卓调用代码(生成条目({ colorScheme }), true)).toEqual({
      名称: 'android_appearance',
      类型: '行为',
      异步: true,
      语句们: [
        'let 引擎 = 当前状态.工具.Android.获得()',
        `await 引擎.设置网页配色方案("${colorScheme}")`,
        `当前状态.结果们.set(7, { colorScheme: "${colorScheme}" })`,
      ],
    })
    expect(生成安卓调用代码(生成条目({ colorScheme }), false)?.语句们).toHaveLength(2)
  })

  it.each([{}, { colorScheme: 'system' }, { colorScheme: 'dark', locale: 'en' }])(
    '拒绝缺失、未知配色及额外设置 %j',
    (参数): void => {
      expect(安卓配色模型.safeParse(参数).success).toBe(false)
      expect(() => 生成安卓调用代码(生成条目(参数), false)).toThrow()
    },
  )
})
