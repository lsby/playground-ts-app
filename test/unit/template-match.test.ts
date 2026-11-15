import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  匹配分数阈值,
  匹配模板,
  在截图中找模板,
  模板边长,
  等待模板后点击,
  裁剪点击模板,
  计算灰度方差,
  读取灰度图,
  type 模板点击选项,
} from '../../src/test-tools/template-match'

type 画布 = { 宽: number; 高: number; 数据: Uint8Array }

function 种子随机(种子: number): () => number {
  let 状态 = 种子
  return (): number => {
    状态 = (状态 * 1664525 + 1013904223) % 4294967296
    return 状态 / 4294967296
  }
}

/** 平缓渐变加一点点噪声的背景，像普通界面底色。 */
function 背景(宽: number, 高: number, 种子 = 1): 画布 {
  let 随机 = 种子随机(种子)
  let 数据 = new Uint8Array(宽 * 高)
  for (let y = 0; y < 高; y += 1)
    for (let x = 0; x < 宽; x += 1) 数据[y * 宽 + x] = Math.round(180 + (x / 宽) * 30 + (y / 高) * 20 + 随机() * 4)
  return { 宽, 高, 数据 }
}

/** 一个有纹理的目标图案（像带文字的按钮），不同种子图案不同。 */
function 图案(边长: number, 种子: number): 画布 {
  let 随机 = 种子随机(种子)
  let 数据 = new Uint8Array(边长 * 边长)
  // 4×4 像素一块，像按钮里的文字笔画，比逐像素噪声更接近真实界面
  let 块数 = Math.ceil(边长 / 4)
  let 块 = Array.from({ length: 块数 * 块数 }, () => (随机() > 0.5 ? 40 : 230))
  for (let y = 0; y < 边长; y += 1)
    for (let x = 0; x < 边长; x += 1) 数据[y * 边长 + x] = 块[Math.floor(y / 4) * 块数 + Math.floor(x / 4)] ?? 0
  return { 宽: 边长, 高: 边长, 数据 }
}

function 贴(画布: 画布, 图: 画布, 左: number, 上: number): void {
  for (let y = 0; y < 图.高; y += 1)
    for (let x = 0; x < 图.宽; x += 1) 画布.数据[(上 + y) * 画布.宽 + 左 + x] = 图.数据[y * 图.宽 + x] ?? 0
}

async function 转PNG(画布: 画布, 放大 = 1): Promise<Buffer> {
  let 流程 = sharp(Buffer.from(画布.数据), { raw: { width: 画布.宽, height: 画布.高, channels: 1 } })
  if (放大 !== 1) 流程 = 流程.resize(Math.round(画布.宽 * 放大), Math.round(画布.高 * 放大), { kernel: 'nearest' })
  return await 流程.png().toBuffer()
}

let 选项: 模板点击选项 = { x: 200, y: 300, 比例: 1, 落点: { x: 32, y: 32 } }

async function 造模板(图案画布: 画布): Promise<Buffer> {
  // 模板是 64×64 的区域：图案居中，周围是同样的背景
  let 底 = 背景(64, 64, 1)
  贴(底, 图案画布, 12, 12)
  return await 转PNG(底)
}

describe('模板匹配', () => {
  let 目标 = 图案(40, 7)

  it('目标整体移动几个像素后仍能找到，并给出正确点击点', async (): Promise<void> => {
    let 页面 = 背景(400, 600, 2)
    // 模板左上角应在 (200-32, 300-32) = (168, 268)，图案在模板里偏 12，目标实际画在偏移 (+9, -6) 的位置
    贴(页面, 目标, 168 + 12 + 9, 268 + 12 - 6)
    let 模板 = await 造模板(目标)
    let 结果 = await 在截图中找模板(await 转PNG(页面), 400, 模板, 选项)
    expect(结果.找到).toBe(true)
    expect(结果.分数).toBeGreaterThanOrEqual(匹配分数阈值)
    // 背景略有不同，只看图案对齐：点击点应整体偏移 (+9, -6)
    expect(Math.abs((结果.点击?.x ?? 0) - 209)).toBeLessThanOrEqual(1)
    expect(Math.abs((结果.点击?.y ?? 0) - 294)).toBeLessThanOrEqual(1)
  })

  it('目标不在窗口里时找不到', async (): Promise<void> => {
    let 页面 = 背景(400, 600, 2)
    let 模板 = await 造模板(目标)
    let 结果 = await 在截图中找模板(await 转PNG(页面), 400, 模板, 选项)
    expect(结果.找到).toBe(false)
    expect(结果.点击).toBeUndefined()
  })

  it('目标在搜索窗口 ±120 之外时找不到', async (): Promise<void> => {
    let 页面 = 背景(500, 700, 2)
    贴(页面, 目标, 168 + 12 + 200, 268 + 12)
    let 模板 = await 造模板(目标)
    let 结果 = await 在截图中找模板(await 转PNG(页面), 500, 模板, 选项)
    expect(结果.找到).toBe(false)
  })

  it('窗口里出现两处一模一样的目标时不算找到', async (): Promise<void> => {
    let 页面 = 背景(400, 600, 2)
    贴(页面, 目标, 168 + 12, 268 + 12)
    贴(页面, 目标, 168 + 12 + 90, 268 + 12 + 10)
    let 模板 = await 造模板(目标)
    let 结果 = await 在截图中找模板(await 转PNG(页面), 400, 模板, 选项)
    expect(结果.找到).toBe(false)
    expect(结果.次高分).toBeGreaterThan(0.8)
  })

  it('另一个不同的图案不会被误认', async (): Promise<void> => {
    let 页面 = 背景(400, 600, 2)
    贴(页面, 图案(40, 99), 168 + 12, 268 + 12)
    let 模板 = await 造模板(目标)
    let 结果 = await 在截图中找模板(await 转PNG(页面), 400, 模板, 选项)
    expect(结果.找到).toBe(false)
  })

  it('截图比例与录制不同时按比例缩放模板（录制 1 倍，回放 2 倍）', async (): Promise<void> => {
    let 页面 = 背景(400, 600, 2)
    贴(页面, 目标, 168 + 12 + 4, 268 + 12)
    let 模板 = await 造模板(目标)
    // 回放设备是 2 倍屏：截图像素是坐标的 2 倍，操作坐标宽仍是 400
    let 结果 = await 在截图中找模板(await 转PNG(页面, 2), 400, 模板, 选项)
    expect(结果.找到).toBe(true)
    expect(Math.abs((结果.点击?.x ?? 0) - 204)).toBeLessThanOrEqual(1)
    expect(Math.abs((结果.点击?.y ?? 0) - 300)).toBeLessThanOrEqual(1)
  })

  it('录制 3 倍、回放 1 倍：模板被缩小后仍能找到', async (): Promise<void> => {
    let 页面 = 背景(400, 600, 2)
    贴(页面, 目标, 168 + 12, 268 + 12)
    let 模板 = await sharp(await 造模板(目标))
      .resize(192, 192, { kernel: 'nearest' })
      .png()
      .toBuffer()
    let 结果 = await 在截图中找模板(await 转PNG(页面), 400, 模板, { ...选项, 比例: 3 })
    expect(结果.找到).toBe(true)
    expect(Math.abs((结果.点击?.x ?? 0) - 200)).toBeLessThanOrEqual(1)
  })
})

describe('模板裁剪', () => {
  it('在页面中间裁出 64×64 单位，落点在中心，并记下比例', async (): Promise<void> => {
    let 页面 = 背景(400, 600, 2)
    贴(页面, 图案(40, 7), 180, 280)
    let 结果 = await 裁剪点击模板(await 转PNG(页面), 400, 600, { x: 200, y: 300 })
    expect(结果.通过).toBe(true)
    if (结果.通过 === false) return
    expect(结果.比例).toBe(1)
    expect(结果.尺寸).toEqual({ 宽: 模板边长, 高: 模板边长 })
    expect(结果.落点).toEqual({ x: 32, y: 32 })
    expect(await sharp(结果.图片).metadata()).toMatchObject({ width: 64, height: 64 })
  })

  it('3 倍屏截图：模板像素是 3 倍，落点仍用操作坐标单位', async (): Promise<void> => {
    let 页面 = 背景(400, 600, 2)
    贴(页面, 图案(40, 7), 180, 280)
    let 结果 = await 裁剪点击模板(await 转PNG(页面, 3), 400, 600, { x: 200, y: 300 })
    expect(结果.通过).toBe(true)
    if (结果.通过 === false) return
    expect(结果.比例).toBe(3)
    expect(await sharp(结果.图片).metadata()).toMatchObject({ width: 192, height: 192 })
    expect(结果.落点).toEqual({ x: 32, y: 32 })
  })

  it('靠近边缘时裁剪框移到边上，落点相对位置随之偏移', async (): Promise<void> => {
    let 页面 = 背景(400, 600, 2)
    贴(页面, 图案(30, 7), 0, 0)
    let 结果 = await 裁剪点击模板(await 转PNG(页面), 400, 600, { x: 5, y: 10 })
    expect(结果.通过).toBe(true)
    if (结果.通过 === false) return
    expect(结果.落点).toEqual({ x: 5, y: 10 })
    expect(await sharp(结果.图片).metadata()).toMatchObject({ width: 64, height: 64 })
  })

  it('落点周围几乎是纯色时拒绝做模板', async (): Promise<void> => {
    let 纯色: 画布 = { 宽: 400, 高: 600, 数据: new Uint8Array(400 * 600).fill(200) }
    let 结果 = await 裁剪点击模板(await 转PNG(纯色), 400, 600, { x: 200, y: 300 })
    expect(结果.通过).toBe(false)
    expect(结果.通过 === false ? 结果.原因 : '').toContain('纯色')
  })

  it('落点在截图之外时拒绝', async (): Promise<void> => {
    let 结果 = await 裁剪点击模板(await 转PNG(背景(400, 600)), 400, 600, { x: 500, y: 10 })
    expect(结果.通过).toBe(false)
  })

  it('纯色模板在匹配时也直接不算找到', async (): Promise<void> => {
    let 纯色: 画布 = { 宽: 64, 高: 64, 数据: new Uint8Array(64 * 64).fill(200) }
    let 灰度 = await 读取灰度图(await 转PNG(背景(400, 600)))
    expect(计算灰度方差(纯色)).toBe(0)
    expect(匹配模板(灰度, { 数据: 纯色.数据, 宽: 64, 高: 64 }, { 左: 0, 上: 0, 右: 300, 下: 300 }).找到).toBe(false)
  })
})

describe('等待模板后点击', () => {
  it('第一次没有、之后出现：轮询到找到再点击', async (): Promise<void> => {
    let 目标 = 图案(40, 7)
    let 无 = await 转PNG(背景(400, 600, 2))
    let 页面 = 背景(400, 600, 2)
    贴(页面, 目标, 168 + 12, 268 + 12)
    let 有 = await 转PNG(页面)
    let 次数 = 0
    let 点击点: { x: number; y: number } | undefined
    let 模板 = await 造模板(目标)
    await 等待模板后点击({
      模板图片: 模板,
      选项,
      超时毫秒: 5000,
      取消信号: new AbortController().signal,
      截图: async () => {
        次数 += 1
        return { 图片: 次数 < 3 ? 无 : 有, 坐标宽: 400 }
      },
      点击: async (x, y): Promise<void> => {
        点击点 = { x, y }
      },
      说明: '测试',
    })
    expect(次数).toBe(3)
    expect(点击点).toBeDefined()
    expect(Math.abs((点击点?.x ?? 0) - 200)).toBeLessThanOrEqual(1)
  })

  it('一直等不到就超时报错，说明最佳分数，不点击', async (): Promise<void> => {
    let 无 = await 转PNG(背景(400, 600, 2))
    let 点击过 = false
    await expect(
      等待模板后点击({
        模板图片: await 造模板(图案(40, 7)),
        选项,
        超时毫秒: 600,
        取消信号: new AbortController().signal,
        截图: async () => ({ 图片: 无, 坐标宽: 400 }),
        点击: async (): Promise<void> => {
          点击过 = true
        },
        说明: '测试',
      }),
    ).rejects.toThrow(/等待图片超时.*最佳分数/u)
    expect(点击过).toBe(false)
  })
})
