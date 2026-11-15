import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { 添加刻度边框, 选择大刻度间隔 } from '../../src/test-tools/observation-image'

describe('观察图片刻度边框', () => {
  it.each([
    [402, 874, 50],
    [1080, 2400, 100],
    [1280, 800, 100],
  ])('坐标范围 %i × %i 的大刻度间隔为 %i', (宽, 高, 间隔): void => {
    expect(选择大刻度间隔(宽, 高)).toBe(间隔)
  })

  it('输出尺寸等于截图尺寸加两倍白边，截图外围不改动尺寸', async (): Promise<void> => {
    let 截图 = await sharp({ create: { width: 402, height: 874, channels: 3, background: '#ff8800' } })
      .png()
      .toBuffer()
    for (let 格式 of ['webp', 'png'] as const) {
      let 输出 = await 添加刻度边框(截图, 402, 874, 格式)
      expect(输出.白边).toBeGreaterThan(0)
      expect(输出.宽).toBe(402 + 输出.白边 * 2)
      expect(输出.高).toBe(874 + 输出.白边 * 2)
      expect(await sharp(输出.图片).metadata()).toMatchObject({ format: 格式, width: 输出.宽, height: 输出.高 })
    }
  })

  it('画面内部不画线，白边为浅灰', async (): Promise<void> => {
    let 截图 = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer()
    let 输出 = await 添加刻度边框(截图, 1080, 2400, 'png')
    let { data, info } = await sharp(输出.图片).raw().toBuffer({ resolveWithObject: true })
    let 像素 = (x: number, y: number): number[] => {
      let 起 = (y * info.width + x) * info.channels
      return [data[起] ?? -1, data[起 + 1] ?? -1, data[起 + 2] ?? -1]
    }
    expect(像素(2, 输出.高 - 2)).toEqual([0xf2, 0xf2, 0xf2])
    expect(像素(输出.白边 + 450, 输出.白边 + 600)).toEqual([255, 255, 255])
  })
})
