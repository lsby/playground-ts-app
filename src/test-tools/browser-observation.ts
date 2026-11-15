import type { 浏览器测试引擎 } from '../model/browser-test'
import type { 画面观察适配器, 观察截图 } from './screen-observation'

let 截图队列 = new WeakMap<浏览器测试引擎, Promise<void>>()

export function 创建浏览器观察适配器(引擎: 浏览器测试引擎): 画面观察适配器 {
  return {
    截图: async (信号): Promise<观察截图> => {
      信号.throwIfAborted()
      let 中止: (() => void) | undefined
      let 中止任务 = new Promise<never>((_resolve, reject) => {
        中止 = (): void => reject(信号.reason)
        信号.addEventListener('abort', 中止, { once: true })
      })
      let 上次截图 = 截图队列.get(引擎) ?? Promise.resolve()
      let 截图任务 = 上次截图.then(async (): Promise<Buffer> => {
        信号.throwIfAborted()
        return await 引擎.截图(undefined, { timeout: 6000 })
      })
      截图队列.set(
        引擎,
        截图任务.then(
          () => {},
          () => {},
        ),
      )
      let 图片: Buffer
      try {
        图片 = await Promise.race([截图任务, 中止任务])
      } finally {
        if (中止 !== undefined) 信号.removeEventListener('abort', 中止)
      }
      信号.throwIfAborted()
      let 宽 = 图片.readUInt32BE(16)
      let 高 = 图片.readUInt32BE(20)
      return { 图片, 宽, 高, 逻辑宽: 宽, 逻辑高: 高, 手机: false }
    },
  }
}
