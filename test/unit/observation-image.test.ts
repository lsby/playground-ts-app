import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { 压缩步骤截图 } from '../../src/test-tools/evidence-image'
import { 压缩观察图片, 计算观察图片尺寸 } from '../../src/test-tools/observation-image'

describe('自动观察图片动态缩放', () => {
  it('高倍手机按约两百万像素缩小，保持比例和手机清晰度', (): void => {
    let 尺寸 = 计算观察图片尺寸({ 宽: 1440, 高: 3200 }, { 逻辑宽: 360, 逻辑高: 800, 手机: true })
    expect(尺寸.宽).toBeGreaterThanOrEqual(720)
    expect(尺寸.宽).toBeLessThan(1440)
    expect(尺寸.宽 * 尺寸.高).toBeGreaterThanOrEqual(2_000_000)
    expect(尺寸.宽 * 尺寸.高).toBeLessThan(2_005_000)
    expect(Math.abs(尺寸.宽 / 1440 - 尺寸.高 / 3200)).toBeLessThan(1 / 1440)
  })

  it('一倍桌面保留全部逻辑像素，超出目标也不缩小小字', (): void => {
    expect(计算观察图片尺寸({ 宽: 3840, 高: 2160 }, { 逻辑宽: 3840, 逻辑高: 2160, 手机: false })).toEqual({
      宽: 3840,
      高: 2160,
    })
    expect(计算观察图片尺寸({ 宽: 3840, 高: 2160 }, { 逻辑宽: 1920, 逻辑高: 1080, 手机: false })).toEqual({
      宽: 1920,
      高: 1080,
    })
  })

  it('手机短边保底优先于目标，窄屏手机和小图不放大或再缩小', (): void => {
    expect(计算观察图片尺寸({ 宽: 1440, 高: 8000 }, { 逻辑宽: 360, 逻辑高: 2000, 手机: true })).toEqual({
      宽: 720,
      高: 4000,
    })
    expect(计算观察图片尺寸({ 宽: 640, 高: 4096 }, { 逻辑宽: 320, 逻辑高: 2048, 手机: true })).toEqual({
      宽: 640,
      高: 4096,
    })
    expect(计算观察图片尺寸({ 宽: 600, 高: 1000 }, { 逻辑宽: 300, 逻辑高: 500, 手机: false })).toEqual({
      宽: 600,
      高: 1000,
    })
  })

  it('仅自动观察压缩缩放，原有报告步骤压缩保留原分辨率', async (): Promise<void> => {
    let 原图 = await sharp({ create: { width: 1440, height: 3200, channels: 3, background: '#e04020' } })
      .png()
      .toBuffer()
    let 输出 = await 压缩观察图片(原图, { 逻辑宽: 360, 逻辑高: 800, 手机: true })
    expect(输出).toMatchObject({ 原宽: 1440, 原高: 3200 })
    expect(await sharp(输出.图片).metadata()).toMatchObject({ format: 'webp', width: 输出.宽, height: 输出.高 })
    expect(输出.宽).toBeLessThan(1440)
    expect(await sharp(await 压缩步骤截图(原图)).metadata()).toMatchObject({
      format: 'webp',
      width: 1440,
      height: 3200,
    })
    let { data } = await sharp(输出.图片).raw().toBuffer({ resolveWithObject: true })
    expect(data[0]).toBeGreaterThan(180)
    expect(data[1]).toBeLessThan(90)
  })

  it('拒绝缺失、非正数和非整数像素尺寸', (): void => {
    expect(() => 计算观察图片尺寸({ 宽: 0, 高: 1000 }, { 逻辑宽: 300, 逻辑高: 500, 手机: true })).toThrow('尺寸')
    expect(() => 计算观察图片尺寸({ 宽: 600.5, 高: 1000 }, { 逻辑宽: 300, 逻辑高: 500, 手机: true })).toThrow('尺寸')
    expect(() => 计算观察图片尺寸({ 宽: 600, 高: 1000 }, { 逻辑宽: Number.NaN, 逻辑高: 500, 手机: true })).toThrow(
      '尺寸',
    )
  })
})
