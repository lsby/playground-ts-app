import sharp from 'sharp'

export type 观察图片缩放条件 = { 逻辑宽: number; 逻辑高: number; 手机: boolean }
type 图片尺寸 = { 宽: number; 高: number }
export type 观察图片 = { 图片: Buffer; 宽: number; 高: number; 原宽: number; 原高: number }

export function 计算观察图片尺寸(原尺寸: 图片尺寸, 条件: 观察图片缩放条件): 图片尺寸 {
  if (
    Number.isSafeInteger(原尺寸.宽) === false ||
    原尺寸.宽 <= 0 ||
    Number.isSafeInteger(原尺寸.高) === false ||
    原尺寸.高 <= 0 ||
    Number.isFinite(条件.逻辑宽) === false ||
    条件.逻辑宽 <= 0 ||
    Number.isFinite(条件.逻辑高) === false ||
    条件.逻辑高 <= 0
  )
    throw new Error('观察图片的像素与逻辑尺寸必须为正数，像素尺寸必须为整数')
  let 原短边 = Math.min(原尺寸.宽, 原尺寸.高)
  let 手机保底比例 = 条件.手机 ? (原短边 >= 720 ? 720 / 原短边 : 1) : 0
  let 比例 = Math.min(
    1,
    Math.max(
      Math.sqrt(2_000_000 / (原尺寸.宽 * 原尺寸.高)),
      条件.逻辑宽 / 原尺寸.宽,
      条件.逻辑高 / 原尺寸.高,
      手机保底比例,
    ),
  )
  return { 宽: Math.ceil(原尺寸.宽 * 比例), 高: Math.ceil(原尺寸.高 * 比例) }
}

export async function 压缩观察图片(图片: Buffer, 条件: 观察图片缩放条件): Promise<观察图片> {
  let 原尺寸 = await sharp(图片).metadata()
  let 尺寸 = 计算观察图片尺寸({ 宽: 原尺寸.width, 高: 原尺寸.height }, 条件)
  let 输出 = await sharp(图片)
    .resize(尺寸.宽, 尺寸.高, { fit: 'fill', withoutEnlargement: true })
    .webp({ quality: 85, smartSubsample: true })
    .toBuffer({ resolveWithObject: true })
  return { 图片: 输出.data, 宽: 输出.info.width, 高: 输出.info.height, 原宽: 原尺寸.width, 原高: 原尺寸.height }
}

export type 刻度图片 = { 图片: Buffer; 宽: number; 高: number; 白边: number }

let 大刻度候选 = [10, 20, 25, 50, 100, 200, 250, 500, 1000]

/** 短边出现的数字个数不超过 10 的最小间隔，保证短边约 6 到 10 个数字。 */
export function 选择大刻度间隔(坐标宽: number, 坐标高: number): number {
  let 短边 = Math.min(坐标宽, 坐标高)
  for (let 间隔 of 大刻度候选) if (Math.floor(短边 / 间隔) <= 10) return 间隔
  return 大刻度候选[大刻度候选.length - 1] ?? 1000
}

/**
 * 给截图四周加刻度边框，刻度数字就是操作坐标。画面内部不画线。
 * 边框尺寸和字号按图片宽度成比例，约 900 像素宽时字号 20。
 */
export async function 添加刻度边框(
  图片: Buffer,
  坐标宽: number,
  坐标高: number,
  格式: 'webp' | 'png' = 'webp',
): Promise<刻度图片> {
  if (Number.isFinite(坐标宽) === false || 坐标宽 <= 0 || Number.isFinite(坐标高) === false || 坐标高 <= 0)
    throw new Error('刻度坐标范围必须为正数')
  let 尺寸 = await sharp(图片).metadata()
  let 内容宽 = 尺寸.width
  let 内容高 = 尺寸.height
  let 比例 = 内容宽 / 900
  let 大间隔 = 选择大刻度间隔(坐标宽, 坐标高)
  let 小间隔 = 大间隔 / 5
  let 最大位数 = String(Math.floor(Math.max(坐标宽, 坐标高) / 大间隔) * 大间隔).length
  let 白边 = Math.ceil(比例 * (28 + 12.5 * Math.max(3, 最大位数)))
  let 字号 = 20 * 比例
  let 横向每单位 = 内容宽 / 坐标宽
  let 纵向每单位 = 内容高 / 坐标高
  let 线色 = '#333'
  let 画 = ''
  let 线 = (x1: number, y1: number, x2: number, y2: number, 粗: number): string =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${线色}" stroke-width="${粗}"/>`
  let 字 = (x: number, y: number, 锚: string, 内容: number): string =>
    `<text x="${x}" y="${y}" text-anchor="${锚}" font-family="Helvetica, Arial, sans-serif" font-size="${字号}" font-weight="600" fill="#111">${String(内容)}</text>`
  for (let 值 = 0; 值 <= 坐标宽 + 1e-9; 值 += 小间隔) {
    let 大 = Math.round(值) % 大间隔 === 0
    let 长 = (大 ? 18 : 8) * 比例
    let 粗 = (大 ? 2 : 1) * Math.max(1, 比例)
    let 位置 = 白边 + 值 * 横向每单位
    画 += 线(位置, 白边 - 长, 位置, 白边, 粗) + 线(位置, 白边 + 内容高, 位置, 白边 + 内容高 + 长, 粗)
    if (大) {
      画 += 字(位置, 白边 - 24 * 比例, 'middle', Math.round(值))
      画 += 字(位置, 白边 + 内容高 + 42 * 比例, 'middle', Math.round(值))
    }
  }
  for (let 值 = 0; 值 <= 坐标高 + 1e-9; 值 += 小间隔) {
    let 大 = Math.round(值) % 大间隔 === 0
    let 长 = (大 ? 18 : 8) * 比例
    let 粗 = (大 ? 2 : 1) * Math.max(1, 比例)
    let 位置 = 白边 + 值 * 纵向每单位
    画 += 线(白边 - 长, 位置, 白边, 位置, 粗) + 线(白边 + 内容宽, 位置, 白边 + 内容宽 + 长, 位置, 粗)
    if (大) {
      画 += 字(白边 - 22 * 比例, 位置 + 7 * 比例, 'end', Math.round(值))
      画 += 字(白边 + 内容宽 + 22 * 比例, 位置 + 7 * 比例, 'start', Math.round(值))
    }
  }
  画 += `<rect x="${白边}" y="${白边}" width="${内容宽}" height="${内容高}" fill="none" stroke="${线色}" stroke-width="1"/>`
  let 总宽 = 内容宽 + 白边 * 2
  let 总高 = 内容高 + 白边 * 2
  let 叠加 = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${总宽}" height="${总高}">${画}</svg>`)
  let 合成 = sharp({ create: { width: 总宽, height: 总高, channels: 3, background: '#f2f2f2' } }).composite([
    { input: await sharp(图片).flatten({ background: '#ffffff' }).toBuffer(), left: 白边, top: 白边 },
    { input: 叠加, left: 0, top: 0 },
  ])
  let 数据 = await (格式 === 'png' ? 合成.png() : 合成.webp({ quality: 85, smartSubsample: true })).toBuffer()
  return { 图片: 数据, 宽: 总宽, 高: 总高, 白边 }
}
