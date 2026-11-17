import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { 格式化需求测试错误 } from '../../scripts/test/requirement/format-error'
import { 标注截图, 获得视口内标注位置 } from '../../src/model/browser-test/screenshot'
import { 浏览器目标歧义错误 } from '../../src/test-tools/browser-target'

async function 创建原图(): Promise<Buffer> {
  return await sharp({ create: { width: 120, height: 100, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer()
}

async function 读取像素(图片: Buffer, x: number, y: number): Promise<number[]> {
  let { data } = await sharp(图片).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let 起点 = (y * 120 + x) * 3
  return [...data.subarray(起点, 起点 + 3)]
}

describe('浏览器截图在 Node 侧标注', () => {
  it('保留原图和尺寸，在CSS像素位置绘制红色圆十字', async (): Promise<void> => {
    let 原图 = await 创建原图()
    let 原图副本 = Buffer.from(原图)
    let 图片 = await 标注截图(原图, { x: 40, y: 50 })
    expect(await sharp(图片).metadata()).toMatchObject({ width: 120, height: 100, format: 'png' })
    expect(await 读取像素(图片, 40, 50)).toEqual([213, 0, 0])
    expect(await 读取像素(图片, 80, 80)).toEqual([255, 255, 255])
    expect(原图.equals(原图副本)).toBe(true)
  })

  it('区域部分超出视口时标记可见区域中心', async (): Promise<void> => {
    let 图片 = await 标注截图(await 创建原图(), { x: -20, y: -10, width: 80, height: 60 })
    expect(await 读取像素(图片, 30, 25)).toEqual([213, 0, 0])
    expect(await 读取像素(图片, 80, 80)).toEqual([255, 255, 255])
  })

  it('区域完全不可见时明确报错', async (): Promise<void> => {
    await expect(标注截图(await 创建原图(), { x: 130, y: 0, width: 10, height: 10 })).rejects.toThrow('目标在视口外')
  })

  it.each([
    { x: -1, y: 0 },
    { x: 120, y: 0 },
    { x: 0, y: 100 },
    { x: NaN, y: 1 },
    { x: Infinity, y: 1 },
  ])('非法坐标 %j 不被静默裁剪', async (位置): Promise<void> => {
    await expect(标注截图(await 创建原图(), 位置)).rejects.toThrow('坐标不在视口内')
  })
})

describe('目标歧义报告分类', () => {
  it('以明确错误代码归类为脚本错误，并保留候选诊断', (): void => {
    let 错误 = new 浏览器目标歧义错误('匹配2个元素：span 和 role=status')
    expect(格式化需求测试错误(错误, import.meta.filename)).toMatchObject({
      类别: '脚本错误',
      消息: '匹配2个元素：span 和 role=status',
    })
  })
})

describe('标注读取只观察当前匹配', () => {
  it('空匹配通过一次快照返回，不调用会等待目标的读取', async (): Promise<void> => {
    let 目标 = {
      evaluateAll: vi
        .fn()
        .mockImplementation(async (回调: (元素们: Element[]) => unknown): Promise<unknown> => 回调([])),
      boundingBox: vi.fn(),
      page: vi.fn(),
    }
    expect(await 获得视口内标注位置(目标)).toBeUndefined()
    expect(目标.evaluateAll).toHaveBeenCalledTimes(1)
    expect(目标.evaluateAll.mock.calls[0]).toHaveLength(1)
    expect(目标.boundingBox).not.toHaveBeenCalled()
    expect(目标.page).not.toHaveBeenCalled()
  })

  it('多个匹配明确报歧义，不挑第一个元素', async (): Promise<void> => {
    let 目标 = {
      evaluateAll: vi
        .fn()
        .mockResolvedValue({ 匹配数量: 2, 候选们: ['<button>A</button>', '<button>B</button>'], 位置: null }),
      boundingBox: vi.fn(),
      page: vi.fn(),
    }
    await expect(获得视口内标注位置(目标)).rejects.toMatchObject({ code: 'BROWSER_TARGET_AMBIGUOUS' })
    expect(目标.boundingBox).not.toHaveBeenCalled()
  })

  it('页面执行错误继续向取证调用方抛出', async (): Promise<void> => {
    let 错误 = new Error('页面上下文已销毁')
    let 目标 = { evaluateAll: vi.fn().mockRejectedValue(错误), boundingBox: vi.fn(), page: vi.fn() }
    await expect(获得视口内标注位置(目标)).rejects.toBe(错误)
  })
})
