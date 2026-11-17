import { describe, expect, it, vi } from 'vitest'

import { 生成需求测试代码 } from '../../scripts/test/requirement/export-operation-record'
import { 生成调用代码 } from '../../scripts/test/requirement/operation-code'
import { 推算回放超时 } from '../../scripts/test/requirement/operation-timeout'
import type { JSON对象, 录制增强, 操作调用条目 } from '../../src/test-tools/operation-record'

vi.mock('../../src/global/env', () => ({
  获得环境变量: (): never => {
    throw new Error('本测试不使用后端环境')
  },
}))

let 测试地址 = { 前端: 'http://localhost:3000', 后端: 'http://localhost:3001' }

function 创建条目(
  tool: string,
  参数: JSON对象,
  毫秒 = 6001,
  增强?: 录制增强,
): Extract<操作调用条目, { status: 'passed' }> {
  return {
    id: 1,
    kind: 'call',
    tool,
    arguments: 参数,
    start: '2026-11-17T00:00:00.000Z',
    end: new Date(Date.parse('2026-11-17T00:00:00.000Z') + 毫秒).toISOString(),
    status: 'passed',
    result: {},
    artifacts: [],
    evidenceErrors: [],
    notes: null,
    ...(增强 === undefined ? {} : { 增强 }),
  }
}

function 代码(条目: 操作调用条目): string {
  return 生成调用代码(条目, { 需要结果: false, 测试地址, 流程文件名前缀: 'timeout-flow' }).语句们.join('\n')
}

describe('按录制耗时推算回放超时', () => {
  it.each([
    [1, 10000],
    [4999, 10000],
    [5000, 10000],
    [5001, 11000],
    [6001, 13000],
    [60000, 120000],
    [180001, 361000],
  ])('录制 %i ms 推算为 %i ms', (毫秒, 期望): void => {
    expect(推算回放超时(创建条目('browser_click', {}, 毫秒))).toBe(期望)
  })

  it.each([
    ['坏开始时间', '2026-11-17T00:00:01Z'],
    ['2026-11-17T00:00:00Z', '坏结束时间'],
    ['2026-11-17T00:00:00Z', '2026-11-17T00:00:00Z'],
    ['2026-11-17T00:00:01Z', '2026-11-17T00:00:00Z'],
  ])('无有效正时长时使用十秒：%s / %s', (start, end): void => {
    expect(推算回放超时({ ...创建条目('browser_click', {}), start, end })).toBe(10000)
  })

  it('尚未结束的条目使用十秒，较长显式参数仍保留', (): void => {
    let 待完成: 操作调用条目 = {
      id: 2,
      kind: 'call',
      tool: 'browser_click',
      arguments: {},
      start: '2026-11-17T00:00:00Z',
      status: 'pending',
      notes: null,
    }
    expect(推算回放超时(待完成)).toBe(10000)
    expect(推算回放超时({ ...待完成, arguments: { timeoutMs: 90000 } })).toBe(90000)
  })

  it.each([1, 5000, 90000])('显式 %i ms 与实测推算取较大值且不修改原条目', (timeoutMs): void => {
    let 条目 = 创建条目('browser_click', { timeoutMs })
    let 原条目 = structuredClone(条目)
    expect(推算回放超时(条目)).toBe(Math.max(13000, timeoutMs))
    expect(条目).toEqual(原条目)
  })
})

let 三端操作: { 工具: string; 参数: JSON对象; 超时格式: RegExp }[] = [
  {
    工具: 'browser_click',
    参数: { name: 'a', target: { by: 'text', text: '继续' } },
    超时格式: /点击\(.+timeout: 13000/u,
  },
  {
    工具: 'browser_wait',
    参数: { name: 'a', target: { by: 'text', text: '继续' }, state: 'visible' },
    超时格式: /验证可见\(.+timeout: 13000/u,
  },
  { 工具: 'ios_tap', 参数: { target: { by: 'webText', value: '继续' } }, 超时格式: /点击\(.+, 13000\)/u },
  {
    工具: 'ios_wait',
    参数: { target: { by: 'webText', value: '继续' }, state: 'visible' },
    超时格式: /验证可见\(.+, 13000\)/u,
  },
  { 工具: 'android_tap', 参数: { target: { by: 'webText', value: '继续' } }, 超时格式: /点击\(.+, 13000\)/u },
  {
    工具: 'android_wait',
    参数: { target: { by: 'webText', value: '继续' }, state: 'visible' },
    超时格式: /验证可见\(.+, 13000\)/u,
  },
]

describe('导出实际回放调用', () => {
  it.each(三端操作)('$工具 使用实测推算值并保留录制原参数', ({ 工具, 参数, 超时格式 }): void => {
    let 条目 = 创建条目(工具, 参数)
    let 原条目 = structuredClone(条目)
    expect(代码(条目)).toMatch(超时格式)
    expect(条目).toEqual(原条目)
  })

  it.each(['browser_open', 'browser_navigate', 'browser_reload', 'browser_wait_url'])(
    '%s 的导航等待带固定推算值',
    (工具): void => {
      let 参数: JSON对象 = { name: 'a' }
      if (工具 === 'browser_open' || 工具 === 'browser_navigate') 参数['url'] = '/index.html'
      if (工具 === 'browser_wait_url') 参数['pattern'] = '/index.html'
      expect(代码(创建条目(工具, 参数))).toContain('timeout: 13000')
    },
  )

  it.each(['browser_click_at', 'ios_tap_at', 'android_tap_at'])(
    '%s 元素增强、图片增强及自动跳转共用推算值',
    (工具): void => {
      let 参数: JSON对象 = 工具 === 'browser_click_at' ? { name: 'a', x: 20, y: 30 } : { x: 20, y: 30 }
      let 增强们: 录制增强[] = [
        { 定位: { 种类: '选择器', 值: '#continue', 说明: '继续按钮' } },
        { 模板: { 文件: '/tmp/template.png', 比例: 1, 原坐标: { x: 20, y: 30 }, 落点: { x: 2, y: 3 } } },
      ]
      for (let 增强 of 增强们) {
        let 条目 = 创建条目(工具, 参数, 6001, { ...增强, 地址变化: { 前: '/#/home', 后: '/#/gift' } })
        let 原条目 = structuredClone(条目)
        let 输出 = 代码(条目)
        expect(输出).toContain('等待地址("/#/gift"')
        expect(输出.match(/13000/gu)).toHaveLength(2)
        expect(输出).not.toContain('15000')
        expect(条目).toEqual(原条目)
      }
    },
  )

  it('完整需求导出将缺失有效时间的短调用提高到十秒', (): void => {
    let 条目 = { ...创建条目('browser_click', { name: 'a', target: { by: 'text', text: '继续' } }), start: '缺失时间' }
    let 输出 = 生成需求测试代码({
      需求模块路径: './requirement',
      源码目录路径: '../../../src',
      覆盖验收点键们: ['完成'],
      流程名称: '时间缺失的回放',
      测试思路: '验证旧录制的等待时间',
      步骤组: [{ 条目们: [条目], 备注们: [] }],
      测试地址,
    })
    expect(输出).toContain('timeout: 10000')
    expect(输出).not.toContain('timeout: undefined')
  })

  it.each(三端操作)('$工具 保留更长的有效显式超时', ({ 工具, 参数 }): void => {
    expect(代码(创建条目(工具, { ...参数, timeoutMs: 90000 }))).toContain('90000')
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '5000', null])(
    '无效显式参数 %s 仍由原 Schema 拒绝',
    (timeoutMs): void => {
      for (let { 工具, 参数 } of 三端操作) {
        let 条目 = 创建条目(工具, { ...参数, timeoutMs })
        let 原条目 = structuredClone(条目)
        expect((): string => 代码(条目)).toThrow()
        expect(条目).toEqual(原条目)
      }
    },
  )
})
