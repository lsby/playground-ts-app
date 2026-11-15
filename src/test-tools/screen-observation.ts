import { setTimeout as 等待 } from 'node:timers/promises'

import sharp from 'sharp'

import { 压缩观察图片, 添加刻度边框, type 观察图片缩放条件 } from './observation-image'

/** 宽、高为操作坐标范围，逻辑尺寸只用于图片清晰度下限。 */
export type 观察截图 = { 图片: Buffer; 宽: number; 高: number } & 观察图片缩放条件
export type 画面观察适配器 = { 截图: (信号: AbortSignal) => Promise<观察截图> }
export type 观察帧 = {
  /** 干净的压缩图，用于存证据。 */
  图片: Buffer
  /** 四周带刻度的图，只给模型看。 */
  刻度图片: Buffer
  时刻: number
  最终画面: boolean
  宽: number
  高: number
  图片宽: number
  图片高: number
  原图宽: number
  原图高: number
  逻辑宽: number
  逻辑高: number
}
export type 画面观察结果 = { settled: boolean; changed?: boolean; durationMs: number; 帧们: readonly 观察帧[] }

type 帧 = { 截图: 观察截图; 时刻: number; 灰度: Buffer }

async function 缩图(截图: 观察截图): Promise<Buffer> {
  if (
    Number.isSafeInteger(截图.宽) === false ||
    Number.isSafeInteger(截图.高) === false ||
    截图.宽 <= 0 ||
    截图.高 <= 0
  )
    throw new Error('截图尺寸必须为正整数')
  return await sharp(截图.图片)
    .flatten({ background: '#ffffff' })
    .resize(100, 100, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer()
}

function 帧差异(甲: 帧, 乙: 帧): number {
  if (甲.截图.宽 !== 乙.截图.宽 || 甲.截图.高 !== 乙.截图.高) return 1
  return 差异(甲.灰度, 乙.灰度)
}

function 差异(甲: Buffer, 乙: Buffer): number {
  if (甲.length !== 乙.length || 甲.length === 0) throw new Error('截图灰度尺寸不一致')
  let 变化 = 0
  for (let 索引 = 0; 索引 < 甲.length; 索引 += 1) {
    let 甲值 = 甲[索引]
    let 乙值 = 乙[索引]
    if (甲值 === undefined || 乙值 === undefined) throw new Error('截图灰度数据不完整')
    if (Math.abs(甲值 - 乙值) > 24) 变化 += 1
  }
  return 变化 / 甲.length
}

function 选帧(帧们: readonly 帧[]): 帧[] {
  let 最终帧 = 帧们.at(-1)
  if (最终帧 === undefined) throw new Error('未取得截图')
  let 已选 = [最终帧]
  while (已选.length < 3) {
    let 最佳: 帧 | undefined
    let 最大差异 = 0.02
    for (let 候选 of 帧们) {
      if (已选.includes(候选)) continue
      let 最小差异 = Math.min(...已选.map((已选帧) => 帧差异(候选, 已选帧)))
      if (最小差异 >= 最大差异) {
        最大差异 = 最小差异
        最佳 = 候选
      }
    }
    if (最佳 === undefined) break
    已选.push(最佳)
  }
  return 已选.sort((甲, 乙) => 甲.时刻 - 乙.时刻)
}

export async function 观察画面(
  适配器: 画面观察适配器,
  取消信号: AbortSignal,
  操作前?: 观察截图,
): Promise<画面观察结果> {
  取消信号.throwIfAborted()
  let 起点 = Date.now()
  let 截止 = new AbortController()
  let 计时器 = setTimeout(() => 截止.abort(), 6000)
  let 采样信号 = AbortSignal.any([取消信号, 截止.signal])
  let 帧们: 帧[] = []
  let 稳定次数 = 0
  let settled = false
  try {
    while (Date.now() - 起点 < 6000) {
      采样信号.throwIfAborted()
      let 截图 = await 适配器.截图(采样信号)
      采样信号.throwIfAborted()
      let 当前: 帧 = { 截图, 时刻: Date.now() - 起点, 灰度: await 缩图(截图) }
      采样信号.throwIfAborted()
      let 上一帧 = 帧们.at(-1)
      帧们.push(当前)
      if (上一帧 !== undefined) {
        稳定次数 = 帧差异(上一帧, 当前) < 0.01 ? 稳定次数 + 1 : 0
        if (稳定次数 >= 2) {
          settled = true
          break
        }
      }
      let 下次 = Math.floor(当前.时刻 / 1000 + 1) * 1000
      if (下次 >= 6000) {
        await 等待(Math.max(0, 起点 + 6000 - Date.now()), undefined, { signal: 采样信号 })
        break
      }
      await 等待(Math.max(0, 起点 + 下次 - Date.now()), undefined, { signal: 采样信号 })
    }
  } catch (错误) {
    取消信号.throwIfAborted()
    if (截止.signal.aborted === false) throw 错误
  } finally {
    clearTimeout(计时器)
  }
  取消信号.throwIfAborted()
  let 最终帧 = 帧们.at(-1)
  if (最终帧 === undefined) throw new Error('六秒内未取得截图')
  let durationMs = Date.now() - 起点
  let changed =
    操作前 === undefined ? undefined : 帧差异({ 截图: 操作前, 时刻: 0, 灰度: await 缩图(操作前) }, 最终帧) >= 0.01
  let 选中帧们: 观察帧[] = []
  for (let 帧 of 选帧(帧们)) {
    取消信号.throwIfAborted()
    let 图片 = await 压缩观察图片(帧.截图.图片, 帧.截图)
    取消信号.throwIfAborted()
    let 刻度 = await 添加刻度边框(图片.图片, 帧.截图.宽, 帧.截图.高)
    取消信号.throwIfAborted()
    选中帧们.push({
      图片: 图片.图片,
      刻度图片: 刻度.图片,
      时刻: 帧.时刻,
      最终画面: 帧 === 最终帧,
      宽: 帧.截图.宽,
      高: 帧.截图.高,
      图片宽: 图片.宽,
      图片高: 图片.高,
      原图宽: 图片.原宽,
      原图高: 图片.原高,
      逻辑宽: 帧.截图.逻辑宽,
      逻辑高: 帧.截图.逻辑高,
    })
  }
  return { settled, ...(changed === undefined ? {} : { changed }), durationMs, 帧们: 选中帧们 }
}
