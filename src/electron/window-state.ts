import { BrowserWindow, screen } from 'electron'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { globalLog } from '../global/global'

/**
 * 窗口状态数据结构
 *
 * 保存窗口的位置、大小、状态以及所在显示器ID
 * displayId 用于多显示器环境下正确恢复窗口位置
 */
export interface 窗口状态数据 {
  width: number
  height: number
  x: number
  y: number
  isMaximized: boolean
  isFullScreen: boolean
  displayId: number
}

export async function 读取窗口状态(窗口状态路径: string): Promise<窗口状态数据 | null> {
  let log = globalLog.extend('electron')

  try {
    if (fs.existsSync(窗口状态路径) === false) {
      return null
    }

    let 文件内容 = fs.readFileSync(窗口状态路径, 'utf-8')
    let data = z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        x: z.number().int(),
        y: z.number().int(),
        isMaximized: z.boolean(),
        isFullScreen: z.boolean(),
        displayId: z.number().int().optional(),
      })
      .strict()
      .parse(JSON.parse(文件内容))

    return {
      width: data.width,
      height: data.height,
      x: data.x,
      y: data.y,
      isMaximized: data.isMaximized,
      isFullScreen: data.isFullScreen,
      displayId: data.displayId ?? screen.getPrimaryDisplay().id,
    }
  } catch (err) {
    await log.warn('读取窗口状态失败:', err)
    return null
  }
}

export async function 保存窗口状态(win: BrowserWindow, 窗口状态路径: string): Promise<void> {
  let log = globalLog.extend('electron')

  try {
    let 边界 = win.getNormalBounds()
    let 当前显示器 = screen.getDisplayNearestPoint({ x: 边界.x, y: 边界.y })

    await log.info('=== 保存窗口状态 ===')
    await log.info('窗口边界:', 边界)
    await log.info('当前显示器 ID:', 当前显示器.id)
    await log.info('当前显示器缩放:', 当前显示器.scaleFactor)
    await log.info('当前显示器工作区:', 当前显示器.workArea)
    await log.info('窗口是否最大化:', win.isMaximized())
    await log.info('窗口是否全屏:', win.isFullScreen())

    let 状态数据: 窗口状态数据 = {
      isMaximized: win.isMaximized(),
      isFullScreen: win.isFullScreen(),
      x: 边界.x,
      y: 边界.y,
      width: 边界.width,
      height: 边界.height,
      displayId: 当前显示器.id,
    }

    let 目录 = path.dirname(窗口状态路径)
    if (fs.existsSync(目录) === false) {
      fs.mkdirSync(目录, { recursive: true })
    }

    fs.writeFileSync(窗口状态路径, JSON.stringify(状态数据, null, 2))
    await log.info('窗口状态已保存')
  } catch (err) {
    await log.warn('保存窗口状态失败:', err)
  }
}

export function 检查窗口是否在可见区域内(bounds: { x: number; y: number; width: number; height: number }): boolean {
  let 所有显示器 = screen.getAllDisplays()

  for (let 显示器 of 所有显示器) {
    let 工作区 = 显示器.workArea

    let 窗口左边界 = bounds.x
    let 窗口右边界 = bounds.x + bounds.width
    let 窗口上边界 = bounds.y
    let 窗口下边界 = bounds.y + bounds.height

    let 显示器左边界 = 工作区.x
    let 显示器右边界 = 工作区.x + 工作区.width
    let 显示器上边界 = 工作区.y
    let 显示器下边界 = 工作区.y + 工作区.height

    let 水平重叠 = 窗口左边界 < 显示器右边界 && 窗口右边界 > 显示器左边界
    let 垂直重叠 = 窗口上边界 < 显示器下边界 && 窗口下边界 > 显示器上边界

    if (水平重叠 === true && 垂直重叠 === true) {
      return true
    }
  }

  return false
}

export function 获取默认窗口位置(): Electron.Rectangle {
  let 主显示器 = screen.getPrimaryDisplay()
  let 工作区 = 主显示器.workArea

  let 默认宽度 = 1200
  let 默认高度 = 800

  let 最大宽度 = 工作区.width * 0.9
  let 最大高度 = 工作区.height * 0.9

  let 宽度 = Math.min(默认宽度, 最大宽度)
  let 高度 = Math.min(默认高度, 最大高度)

  let x = 工作区.x + Math.floor((工作区.width - 宽度) / 2)
  let y = 工作区.y + Math.floor((工作区.height - 高度) / 2)

  return { x, y, width: 宽度, height: 高度 }
}
