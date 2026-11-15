import { spawn } from 'node:child_process'

export async function 执行ADB(参数: readonly string[], 取消信号: AbortSignal, 超时毫秒 = 30_000): Promise<Buffer> {
  if (Number.isSafeInteger(超时毫秒) === false || 超时毫秒 <= 0) throw new Error('ADB 超时必须是正整数')
  取消信号.throwIfAborted()
  let 信号 = AbortSignal.any([取消信号, AbortSignal.timeout(超时毫秒)])
  return await new Promise<Buffer>((完成, 失败): void => {
    let 进程 = spawn('adb', [...参数], { signal: 信号, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let 输出: Buffer[] = []
    let 错误输出: Buffer[] = []
    let 已输出字节 = 0
    let 超出限制 = false
    进程.stdout.on('data', (数据: Buffer): void => {
      已输出字节 += 数据.length
      if (已输出字节 > 32 * 1024 * 1024) {
        超出限制 = true
        进程.kill()
        return
      }
      输出.push(数据)
    })
    进程.stderr.on('data', (数据: Buffer): void => {
      已输出字节 += 数据.length
      if (已输出字节 > 32 * 1024 * 1024) {
        超出限制 = true
        进程.kill()
        return
      }
      错误输出.push(数据)
    })
    进程.once('error', 失败)
    进程.once('close', (退出码, 信号名称): void => {
      if (超出限制) {
        失败(new Error('ADB 输出超过 32 MiB'))
        return
      }
      if (信号.aborted) {
        失败(new Error('ADB 操作已取消或超时', { cause: 信号.reason }))
        return
      }
      if (退出码 !== 0) {
        失败(
          new Error(
            `ADB 执行失败（退出码 ${String(退出码)}，信号 ${String(信号名称)}）：${Buffer.concat(错误输出).toString('utf8').trim()}`,
          ),
        )
        return
      }
      完成(Buffer.concat(输出))
    })
  })
}
