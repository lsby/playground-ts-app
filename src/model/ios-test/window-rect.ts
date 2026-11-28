import type { z } from 'zod'
import type { Appium会话 } from './appium'
import { 矩形模型 } from './schema'

/** 读窗口尺寸（点）。应用刚启动时系统无障碍服务还没就绪，会报 kAXErrorServerNotFound（stale element reference），等一下重试。 */
export async function 读取窗口矩形(会话: Appium会话): Promise<z.infer<typeof 矩形模型>> {
  for (let 次数 = 1; ; 次数++) {
    try {
      return 矩形模型.parse(await 会话.请求('GET', '/window/rect'))
    } catch (错误) {
      if (次数 >= 6 || (错误 instanceof Error && 错误.message.includes('kAXErrorServerNotFound')) === false) throw 错误
      await new Promise<void>((完成): void => void setTimeout(完成, 1500))
    }
  }
}
