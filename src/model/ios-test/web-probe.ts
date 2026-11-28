import { readFile } from 'node:fs/promises'
import { setTimeout as 等待 } from 'node:timers/promises'
import sharp from 'sharp'
import { z } from 'zod'

import { 等待模板后点击, type 模板点击选项 } from '../../test-tools/template-match'
import { 屏幕转网页坐标, type 落点探测结果 } from '../web-locate/candidates'
import { 格式化原生歧义建议, 格式化点中元素, 点中元素脚本, type 原生匹配 } from '../web-locate/diagnostics'
import { 地址一致 } from '../web-locate/page-url'
import { 整理落点结果, 视口模型 } from '../web-locate/probe'
import { 清理脚本, 落点脚本, 读取视口脚本 } from '../web-locate/scripts'
import type { Appium会话 } from './appium'
import { 点中元素模型 } from './schema'
import { 落点验证脚本 } from './web-script'

/**
 * iOS 坐标点击的落点识别。调用前会话要已经切到网页上下文；`网页范围` 是 WebView 控件在屏幕上的位置和大小（点）。
 * 落在 WebView 之外（原生界面）返回无定位。
 */
export async function 探测苹果落点(
  会话: Appium会话,
  网页范围: { x: number; y: number; width: number; height: number },
  落点: { x: number; y: number },
): Promise<落点探测结果> {
  let 视口 = 视口模型.parse(await 会话.执行脚本(读取视口脚本))
  let 点 = 屏幕转网页坐标(落点, { 左: 网页范围.x, 上: 网页范围.y, 宽: 网页范围.width, 高: 网页范围.height }, 视口)
  if (点 === undefined) return { 状态: '无定位', 原因: '落点不在 WebView 内', 命中: '原生界面' }
  try {
    return await 整理落点结果(await 会话.执行脚本(落点脚本, [点.x, 点.y]), async (候选们) => {
      let 序号 = z.number().parse(await 会话.执行脚本(落点验证脚本, [候选们.map(({ 种类, 值 }) => ({ 种类, 值 }))]))
      return 候选们[序号]
    })
  } finally {
    await 会话.执行脚本(清理脚本).catch((): void => {})
  }
}

/** 轮询页面地址直到 pathname 加 hash 与目标一致；超时报错并说明实际地址。 */
export async function 轮询等待地址(
  读取地址: () => Promise<string>,
  目标: string,
  超时毫秒: number,
  取消信号: AbortSignal,
): Promise<void> {
  if (Number.isSafeInteger(超时毫秒) === false || 超时毫秒 <= 0) throw new Error('iOS 等待超时必须是正整数')
  let 超时信号 = AbortSignal.timeout(超时毫秒)
  let 信号 = AbortSignal.any([取消信号, 超时信号])
  let 实际 = ''
  try {
    while (true) {
      实际 = await 读取地址()
      if (地址一致(实际, 目标)) return
      await 等待(150, undefined, { signal: 信号 })
    }
  } catch (错误) {
    取消信号.throwIfAborted()
    if (超时信号.aborted) throw new Error(`iOS 等待地址超时：期望 ${目标}，实际 ${实际}`, { cause: 错误 })
    throw 错误
  }
}

/** 回放用的等画面稳定：每 250ms 截一张缩小灰度图，连续两次差异小于 1% 即稳定，最多 6 秒。 */
export async function 等待苹果画面稳定(
  截图: () => Promise<Buffer>,
  取消信号: AbortSignal,
): Promise<{ 稳定: boolean; 稳定毫秒: number }> {
  let 开始 = Date.now()
  let 上一张: Buffer | undefined
  while (Date.now() - 开始 < 6000) {
    let 灰度 = await sharp(await 截图())
      .flatten({ background: '#ffffff' })
      .resize(100, 100, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer()
    if (上一张 !== undefined && 上一张.length === 灰度.length) {
      let 变化 = 0
      for (let 索引 = 0; 索引 < 灰度.length; 索引 += 1) {
        if (Math.abs((灰度[索引] ?? 0) - (上一张[索引] ?? 0)) > 24) 变化 += 1
      }
      if (变化 / 灰度.length < 0.01) return { 稳定: true, 稳定毫秒: Date.now() - 开始 }
    }
    上一张 = 灰度
    await 等待(250, undefined, { signal: 取消信号 })
  }
  return { 稳定: false, 稳定毫秒: Date.now() - 开始 }
}

/** 没有 DOM 可定位的点击：在原坐标附近用图片模板找目标，找到再点击。 */
export async function 等待苹果模板后点击(参数: {
  模板: string | URL
  选项: 模板点击选项
  超时毫秒: number
  取消信号: AbortSignal
  截图: () => Promise<Buffer>
  窗口宽: number
  点击: (x: number, y: number) => Promise<void>
}): Promise<{ x: number; y: number }> {
  if (Number.isSafeInteger(参数.超时毫秒) === false || 参数.超时毫秒 <= 0) throw new Error('iOS 等待超时必须是正整数')
  return await 等待模板后点击({
    模板图片: await readFile(参数.模板),
    选项: 参数.选项,
    超时毫秒: 参数.超时毫秒,
    取消信号: 参数.取消信号,
    截图: async () => ({ 图片: await 参数.截图(), 坐标宽: 参数.窗口宽 }),
    点击: 参数.点击,
    说明: 'iOS ',
  })
}

/**
 * 点击前记下屏幕坐标（点）处 WebView 里最上层元素的描述；坐标在 WebView 之外记为原生界面。调用前会话要已经切到网页上下文。
 */
export async function 描述苹果点击点(
  会话: Appium会话,
  网页范围: { x: number; y: number; width: number; height: number },
  落点: { x: number; y: number },
): Promise<string> {
  let 视口 = 视口模型.parse(await 会话.执行脚本(读取视口脚本))
  let 点 = 屏幕转网页坐标(落点, { 左: 网页范围.x, 上: 网页范围.y, 宽: 网页范围.width, 高: 网页范围.height }, 视口)
  if (点 === undefined) return '原生界面（该坐标不在 WebView 内）'
  return 格式化点中元素(点中元素模型.parse(await 会话.执行脚本(点中元素脚本, [点.x, 点.y])) ?? null)
}

/** 原生元素匹配多个时读取前几项的文字、描述、标识，给歧义报错用；读取失败（元素已消失）的项跳过。调用前会话要在原生上下文。 */
export async function 读取苹果原生匹配们(会话: Appium会话, 编号们: readonly string[], 总数: number): Promise<string> {
  let 匹配们: 原生匹配[] = []
  for (let [序号, 编号] of 编号们.slice(0, 8).entries()) {
    try {
      let 读 = async (属性: string): Promise<string> =>
        z
          .string()
          .nullish()
          .parse(await 会话.请求('GET', `/element/${编号}/attribute/${属性}`)) ?? ''
      let 文字 = await 读('label')
      let 名称 = await 读('name')
      匹配们.push({ 序号, 类型: await 读('type'), 文字, 名称, 标识: 名称 !== 文字 ? 名称 : '' })
    } catch {
      // 元素已消失，跳过
    }
  }
  return 格式化原生歧义建议(匹配们, 总数)
}
