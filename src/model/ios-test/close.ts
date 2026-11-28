import type { Appium会话 } from './appium'
import type { 苹果网络中转 } from './network-relay'
import { 执行Xcrun, 读取模拟器状态 } from './simctl'

/**
 * 收尾 iOS 测试会话：关 Appium 会话、杀掉被测应用、还原模拟器外观、关掉我们启动的模拟器、处理网络中转。
 * 每一步失败都继续做后面的，最后合并报错。
 */
export async function 关闭苹果会话(参数: {
  会话: Appium会话 | undefined
  设备: string
  包名: string
  原外观: 'light' | 'dark' | undefined
  要关闭模拟器: boolean
  网络中转: 苹果网络中转 | undefined
  /** 中转由本引擎创建时要关掉；由 dev:test 持有时只恢复在线，中转继续监听 */
  拥有网络中转: boolean
}): Promise<void> {
  let { 设备, 包名 } = 参数
  let 错误们: unknown[] = []
  try {
    await 参数.会话?.关闭()
  } catch (错误) {
    错误们.push(错误)
  }
  try {
    await 执行Xcrun(['simctl', 'terminate', 设备, 包名], new AbortController().signal, 15_000)
  } catch {
    // 应用已经退出时 terminate 会报错，可忽略。
  }
  for (let 步骤 of [
    async (): Promise<void> => {
      if (参数.原外观 !== undefined)
        await 执行Xcrun(['simctl', 'ui', 设备, 'appearance', 参数.原外观], new AbortController().signal, 15_000)
    },
    async (): Promise<void> => {
      if (参数.要关闭模拟器 && (await 读取模拟器状态(设备, new AbortController().signal)) === 'Booted')
        await 执行Xcrun(['simctl', 'shutdown', 设备], new AbortController().signal, 60_000)
    },
  ])
    try {
      await 步骤()
    } catch (错误) {
      错误们.push(错误)
    }
  try {
    if (参数.拥有网络中转) await 参数.网络中转?.关闭()
    else 参数.网络中转?.恢复在线()
  } catch (错误) {
    错误们.push(错误)
  }
  if (错误们.length > 0) throw new AggregateError(错误们, '关闭 iOS 测试会话失败')
}
