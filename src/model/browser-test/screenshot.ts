import type { Locator, Page } from '@playwright/test'

export type 截图标注坐标 = { x: number; y: number }
type 区域 = 截图标注坐标 & { width: number; height: number }

export async function 获得视口内标注位置(目标: Locator): Promise<截图标注坐标 | undefined> {
  if ((await 目标.isVisible()) === false) return undefined
  let 位置 = await 目标.evaluate(
    (元素): Promise<(截图标注坐标 & { 主帧: boolean; 水平比例: number; 垂直比例: number }) | null> =>
      new Promise((完成): void => {
        let 定时器 = setTimeout((): void => {
          观察器.disconnect()
          完成(null)
        }, 200)
        let 观察器 = new IntersectionObserver(([条目]): void => {
          clearTimeout(定时器)
          观察器.disconnect()
          if (条目 === undefined || 条目.intersectionRect.width === 0 || 条目.intersectionRect.height === 0) {
            完成(null)
            return
          }
          let 可见 = 条目.intersectionRect
          let 整体 = 条目.boundingClientRect
          let x = 可见.left + 可见.width / 2
          let y = 可见.top + 可见.height / 2
          完成({
            x,
            y,
            主帧: window === window.top,
            水平比例: (x - 整体.left) / 整体.width,
            垂直比例: (y - 整体.top) / 整体.height,
          })
        })
        观察器.observe(元素)
      }),
    undefined,
    { timeout: 200 },
  )
  if (位置 === null) return undefined
  if (位置.主帧 === true) return { x: 位置.x, y: 位置.y }
  let 边界 = await 目标.boundingBox({ timeout: 200 })
  if (边界 === null) return undefined
  return { x: 边界.x + 边界.width * 位置.水平比例, y: 边界.y + 边界.height * 位置.垂直比例 }
}

export async function 标注截图(页面: Page, 截图: Buffer, 标注: 截图标注坐标 | 区域): Promise<Buffer> {
  let 图片 = await 页面.evaluate(
    async ({ 原图, 目标 }): Promise<string> => {
      let 位图 = await createImageBitmap(new Blob([Uint8Array.from(atob(原图), (字符) => 字符.charCodeAt(0))]))
      let 画布 = document.createElement('canvas')
      画布.width = 位图.width
      画布.height = 位图.height
      let 画笔 = 画布.getContext('2d')
      try {
        if (画笔 === null) throw new Error('无法绘制截图标注')
        画笔.drawImage(位图, 0, 0)
      } finally {
        位图.close()
      }

      let { x, y } = 目标
      if ('width' in 目标) {
        let 左 = Math.max(0, x)
        let 上 = Math.max(0, y)
        let 右 = Math.min(画布.width, x + 目标.width)
        let 下 = Math.min(画布.height, y + 目标.height)
        if (右 <= 左 || 下 <= 上) throw new Error('截图标注目标在视口外')
        x = (左 + 右) / 2
        y = (上 + 下) / 2
      }
      if (
        Number.isFinite(x) === false ||
        Number.isFinite(y) === false ||
        x < 0 ||
        y < 0 ||
        x >= 画布.width ||
        y >= 画布.height
      )
        throw new Error(`截图标注坐标不在视口内：(${String(x)}, ${String(y)})`)

      画笔.beginPath()
      画笔.arc(x, y, 11, 0, Math.PI * 2)
      画笔.moveTo(x - 16, y)
      画笔.lineTo(x + 16, y)
      画笔.moveTo(x, y - 16)
      画笔.lineTo(x, y + 16)
      画笔.lineWidth = 5
      画笔.strokeStyle = '#fff'
      画笔.stroke()
      画笔.lineWidth = 2
      画笔.strokeStyle = '#d50000'
      画笔.stroke()
      return 画布.toDataURL('image/png').slice('data:image/png;base64,'.length)
    },
    { 原图: 截图.toString('base64'), 目标: 标注 },
  )
  return Buffer.from(图片, 'base64')
}
