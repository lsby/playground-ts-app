import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { 执行浏览器操作并观察 } from '../../scripts/test/mcp/browser-observation'
import { 执行操作并观察 } from '../../scripts/test/mcp/screen-observation'
import { 观察画面, type 画面观察适配器, type 观察截图 } from '../../src/test-tools/screen-observation'

let 时钟 = vi.hoisted(() => ({ 当前: 0 }))
vi.mock('node:timers/promises', () => ({
  setTimeout: async (毫秒: number, _值: undefined, 选项: { signal: AbortSignal }): Promise<void> => {
    选项.signal.throwIfAborted()
    时钟.当前 += 毫秒
  },
}))

afterEach(() => vi.restoreAllMocks())

async function 创建图片(颜色: string): Promise<观察截图> {
  return {
    图片: await sharp({ create: { width: 120, height: 240, channels: 3, background: 颜色 } })
      .png()
      .toBuffer(),
    宽: 60,
    高: 120,
    逻辑宽: 60,
    逻辑高: 120,
    手机: true,
  }
}

function 开始时钟(): void {
  时钟.当前 = 0
  vi.spyOn(Date, 'now').mockImplementation(() => 时钟.当前)
}

describe('三端共用多帧图片观察', () => {
  it('给模型的图带刻度边框，响应不含尺寸换算信息，证据图保持干净', async (): Promise<void> => {
    let 截图: 观察截图 = {
      图片: await sharp({ create: { width: 1440, height: 3200, channels: 3, background: '#ffffff' } })
        .png()
        .toBuffer(),
      宽: 1440,
      高: 3200,
      逻辑宽: 360,
      逻辑高: 800,
      手机: true,
    }
    开始时钟()
    let 结果 = await 执行操作并观察(
      { 取消信号: new AbortController().signal },
      new AbortController().signal,
      (): 画面观察适配器 => ({ 截图: async () => 截图 }),
      async () => ({ clicked: true }),
      { 首次打开: true },
    )
    expect(结果.响应附加).toMatchObject({ frames: [{ elapsedMs: 2000, final: true }] })
    expect(JSON.stringify(结果.响应附加)).not.toMatch(/width|height|source|logical|coordinate/i)
    let 说明 = 结果.图片们?.[0]?.说明 ?? ''
    expect(说明).toContain('四周刻度数字就是点击坐标')
    expect(说明).not.toMatch(/像素|原图|×/)
    let 刻度 = await sharp(结果.图片们?.[0]?.模型图片).metadata()
    let 证据 = await sharp(结果.图片们?.[0]?.图片).metadata()
    expect(证据.width < 1440).toBe(true)
    expect(刻度.width > 证据.width).toBe(true)
  })

  it('保留最终帧并合并相同画面，返回原分辨率的彩色 WebP', async () => {
    let 截图 = await 创建图片('#e04020')
    let 次数 = 0
    开始时钟()
    let 结果 = await 观察画面(
      {
        截图: async () => {
          次数 += 1
          return 截图
        },
      },
      new AbortController().signal,
      截图,
    )
    expect(次数).toBe(3)
    expect(结果).toMatchObject({ settled: true, changed: false, durationMs: 2000 })
    expect(结果.帧们).toHaveLength(1)
    let 最终帧 = 结果.帧们[0]
    if (最终帧 === undefined) throw new Error('缺少最终帧')
    expect(最终帧).toMatchObject({ 最终画面: true, 时刻: 2000, 宽: 60, 高: 120, 图片宽: 120, 图片高: 240 })
    expect(await sharp(最终帧.图片).metadata()).toMatchObject({ format: 'webp', width: 120, height: 240 })
    let { data } = await sharp(最终帧.图片).raw().toBuffer({ resolveWithObject: true })
    expect(data[0]).toBeGreaterThan(180)
    expect(data[1]).toBeLessThan(90)
  })

  it('持续变化时六秒结束，选中最多三张差异帧并按时间返回', async () => {
    let 截图们 = await Promise.all(['#000000', '#ffffff', '#777777', '#222222', '#bbbbbb', '#555555'].map(创建图片))
    let 索引 = 0
    开始时钟()
    let 结果 = await 观察画面(
      {
        截图: async () => {
          let 截图 = 截图们[索引++]
          if (截图 === undefined) throw new Error('采样越界')
          return 截图
        },
      },
      new AbortController().signal,
    )
    expect(索引).toBe(6)
    expect(结果).toMatchObject({ settled: false, durationMs: 6000 })
    expect(结果).not.toHaveProperty('changed')
    expect(结果.帧们).toHaveLength(3)
    expect(结果.帧们.map((帧) => 帧.时刻)).toEqual([...结果.帧们.map((帧) => 帧.时刻)].sort((甲, 乙) => 甲 - 乙))
    expect(结果.帧们.at(-1)).toMatchObject({ 时刻: 5000, 最终画面: true })
    expect(结果.帧们.filter((帧) => 帧.最终画面)).toHaveLength(1)
  })

  it('MCP 观察保留像素尺寸和操作坐标范围，图片按元数据顺序对应', async () => {
    let 截图 = await 创建图片('#ffffff')
    开始时钟()
    let 结果 = await 执行操作并观察(
      { 取消信号: new AbortController().signal },
      new AbortController().signal,
      (): 画面观察适配器 => ({ 截图: async () => 截图 }),
      async () => ({ clicked: true }),
      { 首次打开: true },
    )
    expect(结果.数据).toEqual({ clicked: true })
    expect(结果.响应附加).toMatchObject({ settled: true, frames: [{ elapsedMs: 2000, final: true }] })
    expect(结果.图片们).toHaveLength(1)
    expect(结果.图片们?.[0]?.内容类型).toBe('image/webp')
    expect(结果.图片们?.[0]?.说明).toContain('2000 毫秒')
    expect(结果.图片们?.[0]?.说明).not.toContain('像素')
    expect(结果.响应附加).not.toHaveProperty('frames.0.width')
    expect(await sharp(结果.图片们?.[0]?.模型图片).metadata()).toMatchObject({ format: 'webp' })
    expect(await sharp(结果.图片们?.[0]?.图片).metadata()).toMatchObject({ width: 120, height: 240 })
  })

  it('动作成功后观察失败单独返回错误，动作失败不继续观察', async () => {
    let 截图 = vi.fn(async (): Promise<never> => {
      throw new Error('截图失败')
    })
    let 结果 = await 执行操作并观察(
      { 取消信号: new AbortController().signal },
      new AbortController().signal,
      () => ({ 截图 }),
      async () => ({ clicked: true }),
      { 首次打开: true },
    )
    expect(结果).toEqual({ 数据: { clicked: true }, 响应附加: { observationError: '截图失败' } })
    截图.mockClear()
    await expect(
      执行操作并观察(
        { 取消信号: new AbortController().signal },
        new AbortController().signal,
        () => ({ 截图 }),
        async () => {
          throw new Error('点击失败')
        },
        { 首次打开: true },
      ),
    ).rejects.toThrow('点击失败')
    expect(截图).not.toHaveBeenCalled()
  })

  it('浏览器 observe=false 只执行动作，取消后不执行动作', async () => {
    let 已执行 = false
    let 信号 = new AbortController().signal
    let 工具 = {
      取消信号: 信号,
      浏览器: {
        获得: (): never => {
          throw new Error('不应获取观察适配器')
        },
      },
    }
    expect(
      await 执行浏览器操作并观察(
        工具,
        信号,
        '无需观察',
        async () => {
          已执行 = true
          return { clicked: true }
        },
        false,
        false,
      ),
    ).toEqual({ 数据: { clicked: true } })
    expect(已执行).toBe(true)
    let 取消 = new AbortController()
    取消.abort(new Error('测试取消'))
    await expect(
      执行浏览器操作并观察(工具, 取消.signal, '取消', async (): Promise<never> => {
        throw new Error('不应执行动作')
      }),
    ).rejects.toThrow('测试取消')
  })
})
