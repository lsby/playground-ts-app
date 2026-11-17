import type { ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'
import { createInterface } from 'node:readline'
import { stripVTControlCharacters } from 'node:util'

import crossSpawn from 'cross-spawn'
import { 测试服务关闭消息 } from '../../src/test-tools/test-service-protocol'

export type 测试进程关闭结果 = { 退出码: number | null; 信号: NodeJS.Signals | null; 错误?: Error }

/** 创建子进程后立即登记，等待真实 close 而非仅 exit；不留下提前拒绝的 Promise。 */
export function 观察测试进程关闭(进程: ChildProcess): Promise<测试进程关闭结果> {
  return new Promise((完成): void => {
    let 错误: Error | undefined
    let 记录错误 = (原因: Error): void => {
      错误 = 原因
    }
    进程.on('error', 记录错误)
    进程.once('close', (退出码, 信号): void => {
      进程.off('error', 记录错误)
      完成({ 退出码, 信号, ...(错误 === undefined ? {} : { 错误 }) })
    })
  })
}

async function 限时等待关闭(关闭任务: Promise<测试进程关闭结果>, 毫秒: number): Promise<测试进程关闭结果> {
  let 定时器: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      关闭任务,
      new Promise<never>((_完成, 拒绝): void => {
        定时器 = setTimeout((): void => 拒绝(new Error(`测试服务关闭超时（${String(毫秒)}ms）`)), 毫秒)
      }),
    ])
  } finally {
    clearTimeout(定时器)
  }
}

/** 非 watch 服务直接持有 HTTP 进程；只发一次 IPC，超时或失败才清理本次进程树。 */
export async function 优雅关闭测试服务进程(
  进程: ChildProcess,
  关闭任务: Promise<测试进程关闭结果>,
  优雅退出期限: number,
): Promise<void> {
  try {
    let 请求失败 = Promise.withResolvers<never>()
    let 完成任务 = Promise.race([关闭任务, 请求失败.promise])
    if (进程.pid !== undefined && 进程已退出(进程) === false) {
      if (进程.connected === false) throw new Error('测试服务缺少关闭 IPC 通道')
      进程.send(测试服务关闭消息, (错误): void => {
        if (错误 !== null) 请求失败.reject(new Error('发送测试服务关闭消息失败', { cause: 错误 }))
      })
    }
    let 结果 = await 限时等待关闭(完成任务, 优雅退出期限)
    if (结果.错误 !== undefined) throw new Error('测试服务进程发生错误', { cause: 结果.错误 })
    if (结果.退出码 !== 0 || 结果.信号 !== null)
      throw new Error(`测试服务关闭失败，退出码：${String(结果.退出码)}，信号：${String(结果.信号)}`)
  } catch (错误) {
    try {
      await 停止测试进程(进程, 1000)
      await 限时等待关闭(关闭任务, 1000)
    } catch (清理错误) {
      throw new AggregateError([错误, 清理错误], '测试服务关闭失败，且未能确认本次服务进程树退出')
    }
    throw 错误
  }
}

export async function 等待测试进程输出(进程: ChildProcess, 就绪行: string, 取消信号?: AbortSignal): Promise<void> {
  let 输出 = 进程.stdout
  if (输出 === null) throw new Error('无法读取测试进程标准输出')
  let 读取器 = createInterface({ input: 输出, crlfDelay: Infinity })
  let { promise, resolve, reject } = Promise.withResolvers<void>()
  let 读取行 = (行: string): void => {
    if (stripVTControlCharacters(行).trim() === 就绪行) resolve()
  }
  let 启动错误 = (错误: Error): void => reject(错误)
  let 提前退出 = (): void => reject(new Error(`测试进程在输出 ${就绪行} 前退出`))
  let 取消 = (): void => reject(new Error('等待测试进程就绪已取消', { cause: 取消信号?.reason }))
  let 定时器 = setTimeout((): void => reject(new Error(`等待测试进程输出 ${就绪行} 超时（120000ms）`)), 120_000)
  try {
    取消信号?.throwIfAborted()
    取消信号?.addEventListener('abort', 取消, { once: true })
    读取器.on('line', 读取行)
    进程.once('error', 启动错误)
    进程.once('exit', 提前退出)
    await promise
  } finally {
    clearTimeout(定时器)
    取消信号?.removeEventListener('abort', 取消)
    进程.off('error', 启动错误)
    进程.off('exit', 提前退出)
    读取器.close()
    输出.resume()
  }
}

function 连接被拒绝(错误: unknown): boolean {
  if (错误 instanceof AggregateError) return 错误.errors.length > 0 && 错误.errors.every(连接被拒绝)
  return 错误 instanceof Error && 'code' in 错误 && 错误.code === 'ECONNREFUSED'
}

export function 测试端口已开放(端口: number, 主机 = '127.0.0.1'): Promise<boolean> {
  return new Promise<boolean>((完成, 失败) => {
    let 连接 = createConnection({ host: 主机, port: 端口 })
    let 结束 = (开放: boolean): void => {
      连接.destroy()
      完成(开放)
    }
    连接.setTimeout(500)
    连接.once('connect', (): void => 结束(true))
    连接.once('timeout', (): void => {
      连接.destroy()
      失败(new Error(`无法确认测试端口 ${主机}:${String(端口)} 的状态，连接超时`))
    })
    连接.once('error', (错误): void => {
      if (连接被拒绝(错误)) 结束(false)
      else {
        连接.destroy()
        失败(错误)
      }
    })
  })
}

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
    let 终止 = crossSpawn('taskkill', ['/pid', String(进程ID), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
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
