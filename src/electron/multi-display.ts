import { BrowserWindow, screen } from 'electron'
import { 全局资源 } from '../global/global'
import { 窗口状态数据 } from './window-state'

/**
 * 多显示器窗口尺寸补偿
 *
 * ## 背景
 * 在多显示器环境下（特别是不同缩放比例的显示器），Electron 的窗口创建行为存在问题：
 * Electron 在创建窗口时，总是按照**主显示器的缩放比例**来解释 BrowserWindowConstructorOptions
 * 中的 width 和 height 参数，而不是根据窗口实际所在显示器的缩放比例。
 *
 * ## 问题示例
 * - 主显示器：缩放 200% (scaleFactor = 2)
 * - 副显示器：缩放 100% (scaleFactor = 1)
 * - 保存的窗口尺寸：800x600（在副显示器上）
 *
 * 如果直接传入 width: 800, height: 600：
 * - Electron 会按主显示器缩放 2 来解释：800 / 2 = 400, 600 / 2 = 300
 * - 实际创建的窗口只有 400x300，比预期小了一半
 *
 * ## 解决方案
 * 计算缩放补偿比例 = 主显示器缩放 / 目标显示器缩放
 * 将保存的尺寸乘以补偿比例后传入
 * 例如：800 * (2/1) = 1600，Electron 解释为 1600 / 2 = 800 ✓
 */
export function 计算补偿后的窗口配置(保存的状态: 窗口状态数据): {
  x: number
  y: number
  width: number
  height: number
} {
  let 所有显示器 = screen.getAllDisplays()
  let 保存时的显示器 = 所有显示器.find((显示器) => 显示器.id === 保存的状态.displayId)

  if (保存时的显示器 === undefined) {
    return { x: 保存的状态.x, y: 保存的状态.y, width: 保存的状态.width, height: 保存的状态.height }
  }

  let 主显示器 = screen.getPrimaryDisplay()
  let 缩放补偿比例 = 主显示器.scaleFactor / 保存时的显示器.scaleFactor

  return {
    x: 保存的状态.x,
    y: 保存的状态.y,
    width: Math.round(保存的状态.width * 缩放补偿比例),
    height: Math.round(保存的状态.height * 缩放补偿比例),
  }
}

/**
 * 验证并修正窗口位置和尺寸
 *
 * ## 为什么需要修正
 * 由于 Electron 的以下问题，创建后的窗口可能不符合预期：
 *
 * 1. **尺寸限制问题**：
 *    - Electron 可能根据窗口所在显示器的工作区大小限制窗口尺寸
 *    - 但这个限制是在已经按主显示器缩放解释尺寸参数之后进行的
 *    - 导致窗口高度被错误地限制
 *
 * 2. **显示器误判问题**：
 *    - 当窗口位置非常接近显示器边界时，Electron 可能误判窗口所在显示器
 *    - 导致窗口被创建在错误的显示器上
 *
 * ## 修正方法
 * 使用 setBounds 强制设置正确的位置和尺寸
 * setBounds 在窗口创建后调用，Electron 此时已知窗口在哪个显示器，会正确应用尺寸
 */
export async function 验证并修正窗口(主窗口: BrowserWindow, 保存的状态: 窗口状态数据): Promise<void> {
  let log = 全局资源.获得日志().extend('electron')

  let 创建后的边界 = 主窗口.getBounds()
  await log.info('窗口创建后的实际边界:', 创建后的边界)

  let 窗口中心点 = { x: 创建后的边界.x + 创建后的边界.width / 2, y: 创建后的边界.y + 创建后的边界.height / 2 }
  let 实际所在显示器 = screen.getDisplayNearestPoint(窗口中心点)

  await log.info('窗口中心点:', 窗口中心点)
  await log.info('实际所在显示器 ID:', 实际所在显示器.id)
  await log.info('实际所在显示器缩放:', 实际所在显示器.scaleFactor)

  let 尺寸不正确 = 创建后的边界.width !== 保存的状态.width || 创建后的边界.height !== 保存的状态.height

  if (实际所在显示器.id === 保存的状态.displayId) {
    if (尺寸不正确 === true) {
      await log.warn('⚠ 窗口在正确的显示器上，但大小不正确，需要修正')
      await log.info('期望大小:', { width: 保存的状态.width, height: 保存的状态.height })
      await log.info('实际大小:', { width: 创建后的边界.width, height: 创建后的边界.height })

      主窗口.setBounds({ x: 保存的状态.x, y: 保存的状态.y, width: 保存的状态.width, height: 保存的状态.height })

      let 修正后的边界 = 主窗口.getBounds()
      await log.info('修正后的边界:', 修正后的边界)
    } else {
      await log.info('✓ 窗口位置和大小完全正确')
    }
  } else {
    await log.warn('⚠ 窗口被创建在了错误的显示器上')
    await log.info('期望显示器 ID:', 保存的状态.displayId)
    await log.info('实际显示器 ID:', 实际所在显示器.id)

    主窗口.setBounds({ x: 保存的状态.x, y: 保存的状态.y, width: 保存的状态.width, height: 保存的状态.height })

    let 修正后的边界 = 主窗口.getBounds()
    await log.info('修正后的边界:', 修正后的边界)
  }
}
