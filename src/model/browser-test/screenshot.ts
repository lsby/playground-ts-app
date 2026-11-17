import type { Locator } from '@playwright/test'
import sharp from 'sharp'

import { 浏览器目标歧义错误 } from '../../test-tools/browser-target'

export type 截图标注坐标 = { x: number; y: number }

type 区域 = 截图标注坐标 & { width: number; height: number }
type 标注几何 = 截图标注坐标 & { 主帧: boolean; 水平比例: number; 垂直比例: number }
type 标注快照 = { 匹配数量: number; 候选们: string[]; 位置: 标注几何 | null }
type 标注目标 = Pick<Locator, 'evaluateAll' | 'boundingBox' | 'page'>

/** 只读取当前几何，不等待绘制事件、滚动或改变页面动画。 */
export async function 获得视口内标注位置(目标: 标注目标): Promise<截图标注坐标 | undefined> {
  let 快照 = await 目标.evaluateAll((元素们): 标注快照 => {
    let 元素 = 元素们[0]
    if (元素们.length !== 1 || 元素 === undefined)
      return {
        匹配数量: 元素们.length,
        候选们: 元素们.slice(0, 5).map((候选): string => 候选.outerHTML.slice(0, 350)),
        位置: null,
      }
    let 样式 = getComputedStyle(元素)
    if (元素.getClientRects().length === 0 || 样式.visibility === 'hidden' || 样式.visibility === 'collapse')
      return { 匹配数量: 1, 候选们: [], 位置: null }
    let 整体 = 元素.getBoundingClientRect()
    let 左 = Math.max(0, 整体.left)
    let 上 = Math.max(0, 整体.top)
    let 右 = Math.min(window.innerWidth, 整体.right)
    let 下 = Math.min(window.innerHeight, 整体.bottom)
    let 父: Element | null = 元素.parentElement
    if (父 === null) {
      let 根 = 元素.getRootNode()
      if (根 instanceof ShadowRoot) 父 = 根.host
    }
    while (父 !== null) {
      let 父样式 = getComputedStyle(父)
      let 框 = 父.getBoundingClientRect()
      let 水平比例 = 父 instanceof HTMLElement && 父.offsetWidth > 0 ? 框.width / 父.offsetWidth : 1
      let 垂直比例 = 父 instanceof HTMLElement && 父.offsetHeight > 0 ? 框.height / 父.offsetHeight : 1
      if (['hidden', 'clip', 'auto', 'scroll'].includes(父样式.overflowX)) {
        左 = Math.max(左, 框.left + 父.clientLeft * 水平比例)
        右 = Math.min(右, 框.left + (父.clientLeft + 父.clientWidth) * 水平比例)
      }
      if (['hidden', 'clip', 'auto', 'scroll'].includes(父样式.overflowY)) {
        上 = Math.max(上, 框.top + 父.clientTop * 垂直比例)
        下 = Math.min(下, 框.top + (父.clientTop + 父.clientHeight) * 垂直比例)
      }
      let 上级: Element | null = 父.parentElement
      if (上级 === null) {
        let 根 = 父.getRootNode()
        if (根 instanceof ShadowRoot) 上级 = 根.host
      }
      父 = 上级
    }
    if (右 <= 左 || 下 <= 上 || 整体.width <= 0 || 整体.height <= 0) return { 匹配数量: 1, 候选们: [], 位置: null }
    let x = (左 + 右) / 2
    let y = (上 + 下) / 2
    return {
      匹配数量: 1,
      候选们: [],
      位置: {
        x,
        y,
        主帧: window === window.top,
        水平比例: (x - 整体.left) / 整体.width,
        垂直比例: (y - 整体.top) / 整体.height,
      },
    }
  })
  if (快照.匹配数量 > 1)
    throw new 浏览器目标歧义错误(
      `截图标注目标匹配了 ${String(快照.匹配数量)} 个元素，请限定唯一目标。候选：\n${快照.候选们.join('\n')}`,
    )
  let 位置 = 快照.位置
  if (位置 === null) return undefined
  if (位置.主帧 === true) return { x: 位置.x, y: 位置.y }
  let 边界 = await 目标.boundingBox({ timeout: 10_000 })
  if (边界 === null) return undefined
  let 坐标 = { x: 边界.x + 边界.width * 位置.水平比例, y: 边界.y + 边界.height * 位置.垂直比例 }
  let 视口 = 目标.page().viewportSize()
  if (视口 !== null && (坐标.x < 0 || 坐标.y < 0 || 坐标.x >= 视口.width || 坐标.y >= 视口.height)) return undefined
  return 坐标
}

/** PNG 在 Node 侧叠加标记，避免向繁忙页面回传图片再用 Canvas 读取像素。 */
export async function 标注截图(截图: Buffer, 标注: 截图标注坐标 | 区域): Promise<Buffer> {
  let { width: 宽, height: 高 } = await sharp(截图).metadata()
  if (宽 <= 0 || 高 <= 0) throw new Error('截图没有有效尺寸')
  let { x, y } = 标注
  if ('width' in 标注) {
    let 左 = Math.max(0, x)
    let 上 = Math.max(0, y)
    let 右 = Math.min(宽, x + 标注.width)
    let 下 = Math.min(高, y + 标注.height)
    if (右 <= 左 || 下 <= 上) throw new Error('截图标注目标在视口外')
    x = (左 + 右) / 2
    y = (上 + 下) / 2
  }
  if (Number.isFinite(x) === false || Number.isFinite(y) === false || x < 0 || y < 0 || x >= 宽 || y >= 高)
    throw new Error(`截图标注坐标不在视口内：(${String(x)}, ${String(y)})`)
  let 图形 = `<circle cx="${String(x)}" cy="${String(y)}" r="11"/><path d="M ${String(x - 16)} ${String(y)} H ${String(x + 16)} M ${String(x)} ${String(y - 16)} V ${String(y + 16)}"/>`
  let 标记 = Buffer.from(
    `<svg width="${String(宽)}" height="${String(高)}" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#fff" stroke-width="5">${图形}</g><g fill="none" stroke="#d50000" stroke-width="2">${图形}</g></svg>`,
  )
  return await sharp(截图)
    .composite([{ input: 标记 }])
    .png()
    .toBuffer()
}
