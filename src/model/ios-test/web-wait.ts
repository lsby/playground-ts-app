import { setTimeout as 等待 } from 'node:timers/promises'

import type { 点击现场记录 } from '../web-locate/diagnostics'
import { 在信号内等待 } from './abortable'
import type { Appium会话 } from './appium'
import { 说明未停稳原因, type 定位结果 } from './click-ready'
import { 定位结果模型 } from './schema'
import type { 苹果目标 } from './types'
import { 定位脚本 } from './web-script'

/**
 * 反复在 WebView 里定位目标，直到 满足(本次, 上次) 为真；超时报错，说明匹配、可见、可点击、禁用的数量，
 * 被谁盖住、动画和位置是否稳定、匹配多个时的推荐定位，以及上一次点击实际点中了什么。
 * 点击前每 150ms 定位一次（要比较连续两次的位置），只等可见或隐藏时每 250ms 一次。
 */
export async function 等待苹果网页定位(参数: {
  会话: () => Appium会话
  使用网页: () => Promise<void>
  取消信号: AbortSignal
  点击现场: 点击现场记录
  目标: 苹果目标
  超时毫秒: number
  说明: string
  要点击: boolean
  满足: (值: 定位结果, 上次: 定位结果 | undefined) => boolean
}): Promise<定位结果> {
  let { 目标, 要点击 } = 参数
  let 超时信号 = AbortSignal.timeout(参数.超时毫秒)
  let 信号 = AbortSignal.any([参数.取消信号, 超时信号])
  let 最后: 定位结果 | undefined
  let 上次: 定位结果 | undefined
  try {
    while (true) {
      上次 = 最后
      最后 = await 在信号内等待(
        信号,
        (async (): Promise<定位结果> => {
          await 参数.使用网页()
          return 定位结果模型.parse(
            await 参数
              .会话()
              .执行脚本(定位脚本, [
                目标.按 === '网页文字' ? 'text' : 'css',
                目标.值,
                要点击,
                目标.匹配 === '包含' ? 'contains' : 'exact',
              ]),
          )
        })(),
      )
      if (参数.满足(最后, 上次)) return 最后
      await 等待(要点击 ? 150 : 250, undefined, { signal: 信号 })
    }
  } catch (错误) {
    参数.取消信号.throwIfAborted()
    if (超时信号.aborted)
      throw 参数.点击现场.附加到错误(
        new Error(
          `iOS 等待目标${参数.说明}超时：${目标.按}=${目标.值}${目标.匹配 === '包含' ? '（包含匹配）' : ''}（匹配 ${String(最后?.数量)} 个，可见 ${String(最后?.可见数量)} 个，可点击 ${String(最后?.可点击)}，禁用 ${String(最后?.禁用)}）${说明未停稳原因(最后, 上次)}`,
          { cause: 错误 },
        ),
      )
    throw 错误
  }
}
