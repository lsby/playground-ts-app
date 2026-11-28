import { setTimeout as 等待 } from 'node:timers/promises'

import { 动作前执行 } from '../../test-tools/action-guard'
import { 标记动作已执行 } from '../../test-tools/action-phase'
import type { Appium会话 } from './appium'

/**
 * 只在当前 WebView 里整页重新加载（W3C refresh），不换 App 进程、不清数据。
 * 重新加载前在页面上留一个标记，新文档里标记不存在且 readyState 为 complete 才算加载完成，避免把旧文档当成新文档；
 * 等待期间上下文编号可能变，读失败就清掉缓存重新找当前进程的页面再试，超时报错。
 */
export async function 重新加载苹果网页(参数: {
  会话: Appium会话
  使用网页: () => Promise<void>
  清缓存: () => void
  取消信号: AbortSignal
  超时毫秒: number
}): Promise<void> {
  await 动作前执行(async () => {
    await 参数.使用网页()
    await 参数.会话.执行脚本('window.__ntReloadMarker = true')
  })
  标记动作已执行()
  await 参数.会话.请求('POST', '/refresh', {})
  let 截止 = Date.now() + 参数.超时毫秒
  let 最后错误: unknown
  while (true) {
    参数.取消信号.throwIfAborted()
    try {
      await 参数.使用网页()
      let 状态 = await 参数.会话.执行脚本<string>(
        "return window.__ntReloadMarker === undefined ? document.readyState : 'old'",
      )
      if (状态 === 'complete') return
    } catch (错误) {
      最后错误 = 错误
      参数.清缓存()
    }
    if (Date.now() > 截止) throw new Error('iOS 整页重新加载后页面没有加载完成', { cause: 最后错误 })
    await 等待(300, undefined, { signal: 参数.取消信号 })
  }
}
