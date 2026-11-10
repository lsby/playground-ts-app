import type { ChildProcess } from 'node:child_process'

import crossSpawn from 'cross-spawn'

function 进程已退出(进程: ChildProcess): boolean {
  return 进程.exitCode !== null || 进程.signalCode !== null
}

function 等待进程退出(进程: ChildProcess, 超时毫秒: number): Promise<boolean> {
  if (进程已退出(进程)) return Promise.resolve(true)
  return new Promise<boolean>((完成) => {
    let 结束 = (): void => {
      clearTimeout(定时器)
      完成(true)
    }
    let 定时器 = setTimeout((): void => {
      进程.off('exit', 结束)
      完成(false)
    }, 超时毫秒)
    进程.once('exit', 结束)
  })
}

function 通知进程组(进程ID: number, 信号: NodeJS.Signals): void {
  try {
    process.kill(-进程ID, 信号)
  } catch (错误) {
    if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'ESRCH') return
    throw 错误
  }
}

export async function 停止测试进程(进程: ChildProcess, 优雅退出期限: number): Promise<void> {
  let 进程ID = 进程.pid
  if (进程ID === undefined || 进程已退出(进程)) return
  if (process.platform === 'win32') {
    let 终止 = crossSpawn('taskkill', ['/pid', String(进程ID), '/T', '/F'], { stdio: 'ignore' })
    await new Promise<void>((完成, 失败) => {
      终止.once('close', (退出码): void => {
        if (退出码 === 0 || 进程已退出(进程)) 完成()
        else 失败(new Error(`taskkill 未能关闭测试进程树，退出码：${String(退出码)}`))
      })
      终止.once('error', 失败)
    })
  } else 通知进程组(进程ID, 'SIGTERM')
  if (await 等待进程退出(进程, 优雅退出期限)) return
  if (process.platform === 'win32') 进程.kill('SIGKILL')
  else 通知进程组(进程ID, 'SIGKILL')
  if ((await 等待进程退出(进程, 1_000)) === false) throw new Error('测试进程未在关闭期限内退出')
}
