import { 环境变量 } from '../global/env'
import { globalLog } from '../global/global'

/**
 * 启动异常兜底，防止未捕获的异常导致进程崩溃
 */
export function 启动异常兜底(关闭应用: () => Promise<void>): void {
  if (环境变量.NODE_ENV !== 'production') return
  let 是否正在退出 = false
  let 强制退出 = (): void => {
    try {
      let { app } = require('electron') as typeof import('electron')
      app.exit(1)
    } catch {
      process.exit(1)
    }
  }
  let 处理致命错误 = async (说明: string, 错误: unknown): Promise<void> => {
    if (是否正在退出 === true) {
      强制退出()
      return
    }
    是否正在退出 = true
    try {
      await globalLog.error(`${说明}: %O`, 错误)
    } catch (日志错误) {
      console.error(说明, 错误, '记录致命错误日志失败:', 日志错误)
    }
    try {
      let 是否关闭完成 = await Promise.race([
        关闭应用().then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000)),
      ])
      if (是否关闭完成 === false) console.error('应用关闭超时，将强制退出')
    } catch (关闭错误) {
      console.error('处理致命错误时关闭应用失败:', 关闭错误)
    }
    强制退出()
  }

  process.on('uncaughtException', (error) => {
    void 处理致命错误('未捕获的异常 (uncaughtException)', error)
  })
  process.on('unhandledRejection', (reason) => {
    void 处理致命错误('未处理的 Promise 拒绝 (unhandledRejection)', reason)
  })
}
