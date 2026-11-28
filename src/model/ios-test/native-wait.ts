import { setTimeout as 等待 } from 'node:timers/promises'
import { z } from 'zod'

import type { 点击现场记录 } from '../web-locate/diagnostics'
import { 在信号内等待 } from './abortable'
import type { Appium会话 } from './appium'
import { 生成原生谓词 } from './native-predicate'
import { 元素标识模型, 矩形模型 } from './schema'
import type { 苹果目标 } from './types'
import { 读取苹果原生匹配们 } from './web-probe'

type 原生元素 = { 编号: string; x: number; y: number; 宽: number; 高: number; 可见: boolean }

/** 在原生无障碍树里按条件找元素，返回每个匹配的屏幕位置（单位是点）。调用前会话要在原生上下文。 */
async function 查找原生元素们(会话: Appium会话, 目标: 苹果目标): Promise<原生元素[]> {
  let 元素们 = z
    .array(元素标识模型)
    .parse(await 会话.请求('POST', '/elements', { using: '-ios predicate string', value: 生成原生谓词(目标) }))
  let 结果: 原生元素[] = []
  for (let 元素 of 元素们) {
    let 编号 = 元素['element-6066-11e4-a52e-4f735466cecf']
    try {
      let 范围 = 矩形模型.parse(await 会话.请求('GET', `/element/${编号}/rect`))
      let 显示 = z.boolean().parse(await 会话.请求('GET', `/element/${编号}/displayed`))
      结果.push({
        编号,
        x: 范围.x,
        y: 范围.y,
        宽: 范围.width,
        高: 范围.height,
        可见: 显示 && 范围.width > 0 && 范围.height > 0,
      })
    } catch {
      // 元素在查询期间消失，当作不存在。
    }
  }
  return 结果
}

/**
 * 等原生目标出现（应存在）或消失；匹配多个时报错并列出各项的文字、描述、标识，超时报错并带上一次点击实际点中了什么。
 * 结束后切回网页上下文。
 */
export async function 等待苹果原生元素(参数: {
  会话: () => Appium会话
  使用原生: () => Promise<void>
  使用网页: () => Promise<void>
  取消信号: AbortSignal
  点击现场: 点击现场记录
  目标: 苹果目标
  超时毫秒: number
  说明: string
  应存在: boolean
}): Promise<{ x: number; y: number; 宽: number; 高: number } | undefined> {
  let { 目标, 应存在 } = 参数
  let 超时信号 = AbortSignal.timeout(参数.超时毫秒)
  let 信号 = AbortSignal.any([参数.取消信号, 超时信号])
  let 最后数量 = 0
  try {
    while (true) {
      let 可见们 = await 在信号内等待(
        信号,
        (async (): Promise<原生元素[]> => {
          await 参数.使用原生()
          return (await 查找原生元素们(参数.会话(), 目标)).filter((元素) => 元素.可见)
        })(),
      )
      最后数量 = 可见们.length
      if (应存在 === false && 可见们.length === 0) return undefined
      if (应存在 && 可见们.length > 1)
        throw new Error(
          `iOS 目标匹配到多个元素：${目标.按}=${目标.值}${目标.匹配 === '包含' ? '（包含匹配）' : ''}\n${await 读取苹果原生匹配们(
            参数.会话(),
            可见们.map((元素) => 元素.编号),
            可见们.length,
          )}`,
        )
      if (应存在 && 可见们.length === 1) return 可见们[0]
      await 等待(250, undefined, { signal: 信号 })
    }
  } catch (错误) {
    参数.取消信号.throwIfAborted()
    if (超时信号.aborted)
      throw 参数.点击现场.附加到错误(
        new Error(
          `iOS 等待目标${参数.说明}超时：${目标.按}=${目标.值}${目标.匹配 === '包含' ? '（包含匹配）' : ''}（可见匹配 ${String(最后数量)} 个）`,
          { cause: 错误 },
        ),
      )
    throw 错误
  } finally {
    await 参数.使用网页()
  }
}
