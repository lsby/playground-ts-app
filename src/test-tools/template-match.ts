import { setTimeout as 等待 } from 'node:timers/promises'

import sharp from 'sharp'

/**
 * 没有 DOM 可定位的点击（Canvas、原生界面）用「图片模板」回放：
 * 录制时从点击前的截图裁出落点周围一小块，回放时在原坐标附近的搜索窗口里做归一化互相关匹配。
 * 三端（iOS、Android、浏览器）共用这一份实现；只依赖 sharp 取灰度像素，不引入别的依赖。
 */
export type 灰度图 = { 数据: Uint8Array; 宽: number; 高: number }
export type 模板匹配结果 = {
  找到: boolean
  /** 最佳匹配的模板左上角，单位是截图像素；没有可比位置时为 undefined。 */
  左?: number
  上?: number
  分数: number
  次高分: number
}
/** 模板左上角允许出现的位置范围，单位是截图像素，两端都包含。 */
export type 搜索范围 = { 左: number; 上: number; 右: number; 下: number }

/** 灰度方差（0 到 255 的灰度）低于它，模板几乎是纯色，匹配没有意义。 */
export let 最小模板方差 = 25
export let 匹配分数阈值 = 0.85
/** 最佳分数要比第二名至少高出这么多才算「明显更高」，多处相似时不算找到。 */
export let 最小领先分数 = 0.05
export let 模板边长 = 64
export let 搜索半径 = 120

export async function 读取灰度图(图片: Buffer, 目标尺寸?: { 宽: number; 高: number }): Promise<灰度图> {
  let 流程 = sharp(图片).flatten({ background: '#ffffff' })
  if (目标尺寸 !== undefined) 流程 = 流程.resize(目标尺寸.宽, 目标尺寸.高, { fit: 'fill' })
  let { data, info } = await 流程.greyscale().raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 1) throw new Error('灰度图应只有一个通道')
  return { 数据: new Uint8Array(data), 宽: info.width, 高: info.height }
}

export function 计算灰度方差(图: 灰度图): number {
  let 数量 = 图.数据.length
  if (数量 === 0) return 0
  let 和 = 0
  let 平方和 = 0
  for (let 值 of 图.数据) {
    和 += 值
    平方和 += 值 * 值
  }
  return 平方和 / 数量 - (和 / 数量) ** 2
}

/** 整数倍缩小（盒式平均），尺寸向下取整。 */
function 缩小(图: 灰度图, 倍数: number): 灰度图 {
  if (倍数 === 1) return 图
  let 宽 = Math.floor(图.宽 / 倍数)
  let 高 = Math.floor(图.高 / 倍数)
  let 数据 = new Uint8Array(宽 * 高)
  let 面积 = 倍数 * 倍数
  for (let y = 0; y < 高; y += 1)
    for (let x = 0; x < 宽; x += 1) {
      let 和 = 0
      for (let dy = 0; dy < 倍数; dy += 1) {
        let 行 = (y * 倍数 + dy) * 图.宽 + x * 倍数
        for (let dx = 0; dx < 倍数; dx += 1) 和 += 图.数据[行 + dx] ?? 0
      }
      数据[y * 宽 + x] = Math.round(和 / 面积)
    }
  return { 数据, 宽, 高 }
}

function 裁出(图: 灰度图, 左: number, 上: number, 宽: number, 高: number): 灰度图 {
  let 数据 = new Uint8Array(宽 * 高)
  for (let y = 0; y < 高; y += 1) {
    let 起点 = (上 + y) * 图.宽 + 左
    数据.set(图.数据.subarray(起点, 起点 + 宽), y * 宽)
  }
  return { 数据, 宽, 高 }
}

type 零均值模板 = { 值: Float32Array; 范数: number }

function 准备模板(模板: 灰度图): 零均值模板 {
  let 数量 = 模板.数据.length
  let 和 = 0
  for (let 值 of 模板.数据) 和 += 值
  let 均值 = 和 / 数量
  let 值 = new Float32Array(数量)
  let 平方和 = 0
  for (let 索引 = 0; 索引 < 数量; 索引 += 1) {
    let 差 = (模板.数据[索引] ?? 0) - 均值
    值[索引] = 差
    平方和 += 差 * 差
  }
  return { 值, 范数: Math.sqrt(平方和) }
}

/** 模板左上角放在 (x, y) 时的归一化互相关分数，范围 -1 到 1；窗口是纯色时是 0。 */
function 分数(图: 灰度图, 模板: 灰度图, 准备: 零均值模板, x: number, y: number): number {
  let 点积 = 0
  let 和 = 0
  let 平方和 = 0
  for (let 行 = 0; 行 < 模板.高; 行 += 1) {
    let 图起点 = (y + 行) * 图.宽 + x
    let 模板起点 = 行 * 模板.宽
    for (let 列 = 0; 列 < 模板.宽; 列 += 1) {
      let 像素 = 图.数据[图起点 + 列] ?? 0
      和 += 像素
      平方和 += 像素 * 像素
      点积 += (准备.值[模板起点 + 列] ?? 0) * 像素
    }
  }
  let 数量 = 模板.宽 * 模板.高
  let 方差和 = 平方和 - (和 * 和) / 数量
  if (方差和 <= 1e-6 || 准备.范数 <= 1e-6) return 0
  return 点积 / (准备.范数 * Math.sqrt(方差和))
}

function 夹紧(值: number, 最小: number, 最大: number): number {
  return Math.min(最大, Math.max(最小, 值))
}

/**
 * 在搜索范围内找模板：先缩小若干倍粗找（同时得到第二名），再在原分辨率上细找。
 * 达到阈值且明显高于第二名才算找到。
 */
export function 匹配模板(截图: 灰度图, 模板: 灰度图, 范围: 搜索范围): 模板匹配结果 {
  let 无结果: 模板匹配结果 = { 找到: false, 分数: 0, 次高分: 0 }
  if (模板.宽 <= 0 || 模板.高 <= 0 || 模板.宽 > 截图.宽 || 模板.高 > 截图.高) return 无结果
  if (计算灰度方差(模板) < 最小模板方差) return 无结果
  let 左限 = 夹紧(Math.floor(范围.左), 0, 截图.宽 - 模板.宽)
  let 右限 = 夹紧(Math.ceil(范围.右), 0, 截图.宽 - 模板.宽)
  let 上限 = 夹紧(Math.floor(范围.上), 0, 截图.高 - 模板.高)
  let 下限 = 夹紧(Math.ceil(范围.下), 0, 截图.高 - 模板.高)
  if (右限 < 左限 || 下限 < 上限) return 无结果
  let 倍数 = Math.max(1, Math.floor(Math.min(模板.宽, 模板.高) / 32))
  // 把搜索区域连同模板尺寸裁出来再缩小，避免缩小整张截图
  let 区域 = 裁出(截图, 左限, 上限, 右限 - 左限 + 模板.宽, 下限 - 上限 + 模板.高)
  let 粗区域 = 缩小(区域, 倍数)
  let 粗模板 = 缩小(模板, 倍数)
  if (粗模板.宽 <= 0 || 粗模板.高 <= 0 || 粗模板.宽 > 粗区域.宽 || 粗模板.高 > 粗区域.高) return 无结果
  let 粗准备 = 准备模板(粗模板)
  if (粗准备.范数 <= 1e-6) return 无结果
  let 列数 = 粗区域.宽 - 粗模板.宽 + 1
  let 行数 = 粗区域.高 - 粗模板.高 + 1
  let 分数们 = new Float32Array(列数 * 行数)
  let 最佳序号 = 0
  for (let 行 = 0; 行 < 行数; 行 += 1)
    for (let 列 = 0; 列 < 列数; 列 += 1) {
      let 值 = 分数(粗区域, 粗模板, 粗准备, 列, 行)
      分数们[行 * 列数 + 列] = 值
      if (值 > (分数们[最佳序号] ?? -2)) 最佳序号 = 行 * 列数 + 列
    }
  let 粗最佳 = 分数们[最佳序号] ?? 0
  let 最佳列 = 最佳序号 % 列数
  let 最佳行 = Math.floor(最佳序号 / 列数)
  let 排除半径 = Math.max(2, Math.floor(Math.min(粗模板.宽, 粗模板.高) / 3))
  let 次高 = 0
  let 有次高 = false
  for (let 行 = 0; 行 < 行数; 行 += 1)
    for (let 列 = 0; 列 < 列数; 列 += 1) {
      if (Math.abs(列 - 最佳列) <= 排除半径 && Math.abs(行 - 最佳行) <= 排除半径) continue
      let 值 = 分数们[行 * 列数 + 列] ?? 0
      if (有次高 === false || 值 > 次高) {
        次高 = 值
        有次高 = true
      }
    }
  if (有次高 === false) 次高 = 0
  // 细找：在粗找最佳位置周围，用原分辨率逐像素找
  let 细准备 = 准备模板(模板)
  let 细中心列 = 最佳列 * 倍数
  let 细中心行 = 最佳行 * 倍数
  let 最大列 = 区域.宽 - 模板.宽
  let 最大行 = 区域.高 - 模板.高
  let 细最佳 = -2
  let 细列 = 0
  let 细行 = 0
  for (let 行 = 夹紧(细中心行 - 倍数, 0, 最大行); 行 <= 夹紧(细中心行 + 倍数, 0, 最大行); 行 += 1)
    for (let 列 = 夹紧(细中心列 - 倍数, 0, 最大列); 列 <= 夹紧(细中心列 + 倍数, 0, 最大列); 列 += 1) {
      let 值 = 分数(区域, 模板, 细准备, 列, 行)
      if (值 > 细最佳) {
        细最佳 = 值
        细列 = 列
        细行 = 行
      }
    }
  let 找到 = 细最佳 >= 匹配分数阈值 && 粗最佳 - 次高 >= 最小领先分数
  return { 找到, 左: 左限 + 细列, 上: 上限 + 细行, 分数: 细最佳, 次高分: 次高 }
}

export type 模板裁剪结果 =
  | {
      通过: true
      /** PNG，保持截图的原始像素。 */
      图片: Buffer
      /** 截图像素与操作坐标单位之比（iOS 是 3 之类，Android 和浏览器是 1）。 */
      比例: number
      /** 落点在模板里的相对位置，单位是操作坐标。 */
      落点: { x: number; y: number }
      /** 模板大小，单位是操作坐标。 */
      尺寸: { 宽: number; 高: number }
    }
  | { 通过: false; 原因: string }

/**
 * 从点击前的截图里裁出落点周围约 64×64 个操作坐标单位；靠近边缘就把裁剪框移到边上。
 * 灰度方差太低（几乎纯色）时拒绝。
 */
export async function 裁剪点击模板(
  截图: Buffer,
  坐标宽: number,
  坐标高: number,
  点: { x: number; y: number },
): Promise<模板裁剪结果> {
  if (坐标宽 <= 0 || 坐标高 <= 0 || 点.x < 0 || 点.y < 0 || 点.x >= 坐标宽 || 点.y >= 坐标高)
    return { 通过: false, 原因: '落点在截图范围之外' }
  let 元数据 = await sharp(截图).metadata()
  let 像素宽 = 元数据.width
  let 像素高 = 元数据.height
  let 比例 = 像素宽 / 坐标宽
  let 宽单位 = Math.min(模板边长, 坐标宽)
  let 高单位 = Math.min(模板边长, 坐标高)
  let 左单位 = 夹紧(点.x - 宽单位 / 2, 0, 坐标宽 - 宽单位)
  let 上单位 = 夹紧(点.y - 高单位 / 2, 0, 坐标高 - 高单位)
  let 左 = 夹紧(Math.round(左单位 * 比例), 0, 像素宽 - 1)
  let 上 = 夹紧(Math.round(上单位 * 比例), 0, 像素高 - 1)
  let 宽 = 夹紧(Math.round(宽单位 * 比例), 1, 像素宽 - 左)
  let 高 = 夹紧(Math.round(高单位 * 比例), 1, 像素高 - 上)
  let 图片 = await sharp(截图).extract({ left: 左, top: 上, width: 宽, height: 高 }).png().toBuffer()
  let 灰度 = await 读取灰度图(图片)
  let 方差 = 计算灰度方差(灰度)
  if (方差 < 最小模板方差)
    return { 通过: false, 原因: `落点周围几乎是纯色（灰度方差 ${方差.toFixed(1)}），做不了图片模板` }
  return {
    通过: true,
    图片,
    比例,
    落点: { x: (点.x * 比例 - 左) / 比例, y: (点.y * 比例 - 上) / 比例 },
    尺寸: { 宽: 宽 / 比例, 高: 高 / 比例 },
  }
}

export type 模板点击选项 = {
  /** 录制时的原坐标。 */
  x: number
  y: number
  /** 录制时截图像素与操作坐标之比。 */
  比例: number
  /** 落点在模板里的相对位置，单位是操作坐标。 */
  落点: { x: number; y: number }
}
export type 模板查找结果 = 模板匹配结果 & { 点击?: { x: number; y: number } }

/**
 * 在一张截图里找模板，按当前截图与录制时的比例缩放模板，在原坐标 ±搜索半径 内搜索。
 * 找到后换算出点击点（操作坐标，取整）。
 */
export async function 在截图中找模板(
  截图: Buffer,
  坐标宽: number,
  模板图片: Buffer,
  选项: 模板点击选项,
): Promise<模板查找结果> {
  let 截图灰度 = await 读取灰度图(截图)
  let 当前比例 = 截图灰度.宽 / 坐标宽
  let 模板元数据 = await sharp(模板图片).metadata()
  let 缩放 = 当前比例 / 选项.比例
  let 模板灰度 =
    Math.abs(缩放 - 1) < 0.005
      ? await 读取灰度图(模板图片)
      : await 读取灰度图(模板图片, {
          宽: Math.max(1, Math.round(模板元数据.width * 缩放)),
          高: Math.max(1, Math.round(模板元数据.height * 缩放)),
        })
  // 模板左上角在原截图里的位置，以及它允许偏离的范围
  let 原左 = (选项.x - 选项.落点.x) * 当前比例
  let 原上 = (选项.y - 选项.落点.y) * 当前比例
  let 半径 = 搜索半径 * 当前比例
  let 结果 = 匹配模板(截图灰度, 模板灰度, { 左: 原左 - 半径, 上: 原上 - 半径, 右: 原左 + 半径, 下: 原上 + 半径 })
  if (结果.找到 === false || 结果.左 === undefined || 结果.上 === undefined) return 结果
  let 点击x = Math.round((结果.左 + 选项.落点.x * 当前比例) / 当前比例)
  let 点击y = Math.round((结果.上 + 选项.落点.y * 当前比例) / 当前比例)
  return { ...结果, 点击: { x: 点击x, y: 点击y } }
}

/**
 * 回放用：轮询截图直到找到模板再点击，等不到就在超时后报错（附最佳分数）。
 * 三端引擎各自提供截图（含操作坐标宽度）和点击坐标的动作。
 */
export async function 等待模板后点击(参数: {
  模板图片: Buffer
  选项: 模板点击选项
  超时毫秒: number
  取消信号: AbortSignal
  截图: () => Promise<{ 图片: Buffer; 坐标宽: number }>
  点击: (x: number, y: number) => Promise<void>
  说明: string
}): Promise<{ x: number; y: number }> {
  if (Number.isSafeInteger(参数.超时毫秒) === false || 参数.超时毫秒 <= 0) throw new Error('等待超时必须是正整数')
  let 截止 = Date.now() + 参数.超时毫秒
  let 最后: 模板匹配结果 = { 找到: false, 分数: 0, 次高分: 0 }
  while (true) {
    参数.取消信号.throwIfAborted()
    let { 图片, 坐标宽 } = await 参数.截图()
    let 结果 = await 在截图中找模板(图片, 坐标宽, 参数.模板图片, 参数.选项)
    最后 = 结果
    if (结果.点击 !== undefined) {
      await 参数.点击(结果.点击.x, 结果.点击.y)
      return 结果.点击
    }
    if (Date.now() >= 截止)
      throw new Error(
        `${参数.说明}等待图片超时：原坐标 (${String(参数.选项.x)}, ${String(参数.选项.y)}) 附近没有找到模板（最佳分数 ${最后.分数.toFixed(3)}，次高分 ${最后.次高分.toFixed(3)}，需要至少 ${String(匹配分数阈值)} 且领先 ${String(最小领先分数)}）`,
      )
    await 等待(300, undefined, { signal: 参数.取消信号 })
  }
}
