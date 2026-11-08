import type { ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { setTimeout as 等待 } from 'node:timers/promises'

import crossSpawn from 'cross-spawn'
import { z } from 'zod'

import type { 测试服务日志内容 } from '../../src/model/test-requirement/tools'
import type { 测试服务日志位置 } from '../../src/test-tools/runtime'
import { 测试日志缓冲 } from './service-log'

/**
 * 测试服务是为一次需求测试运行提供后端的独立进程。
 * 它关联项目中的启动任务和报告位置，记录本次启动和关闭状态。
 * 测试运行器通过它等待后端就绪、获取服务地址，并在结束时停止进程、保存日志。
 */
export class 测试服务 {
  private 已尝试启动 = false
  private 进程: ChildProcess | undefined
  private readonly 日志控制器 = new AbortController()
  private 日志任务: Promise<PromiseSettledResult<void>[]> | undefined
  private 关闭任务: Promise<void> | undefined
  private 标准输出 = new 测试日志缓冲()
  private 错误输出 = new 测试日志缓冲()

  public constructor(
    private readonly 根目录: string,
    private readonly 报告目录: string,
    private readonly 启动任务: 'test:requirement:server' | 'run:service:test:watch' = 'test:requirement:server',
  ) {
    if (path.isAbsolute(根目录) === false) throw new Error('测试服务项目根目录必须是绝对路径')
    if (path.isAbsolute(报告目录) === false) throw new Error('测试服务报告目录必须是绝对路径')
  }

  public 获得服务地址(): string {
    return this.获得配置().服务地址
  }

  public 获得日志位置(): 测试服务日志位置 {
    return { 标准输出: this.标准输出.获得位置(), 错误输出: this.错误输出.获得位置() }
  }

  public 读取日志(起点: 测试服务日志位置): 测试服务日志内容 {
    return { 标准输出: this.标准输出.读取(起点.标准输出), 错误输出: this.错误输出.读取(起点.错误输出) }
  }

  public async 启动(): Promise<string> {
    if (this.已尝试启动) throw new Error('测试服务只能启动一次')
    this.检查未关闭()
    this.已尝试启动 = true
    let 环境文件 = z.string().min(1).parse(process.env['ENV_FILE_PATH'])
    let { 端口, 服务地址 } = this.获得配置()
    if (await this.端口已开放(端口)) throw new Error(`测试服务端口 ${String(端口)} 已被占用，拒绝连接遗留服务`)
    this.检查未关闭()

    fs.mkdirSync(this.报告目录, { recursive: true })
    let 进程 = crossSpawn(
      process.execPath,
      ['--import', 'tsx', 'scripts/task/index.ts', this.启动任务, '--env', 环境文件],
      { cwd: this.根目录, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' },
    )
    this.进程 = 进程
    let 启动错误: Error | undefined
    进程.once('error', (错误): void => {
      启动错误 = 错误
    })
    try {
      let { stdout, stderr } = 进程
      if (stdout === null || stderr === null) throw new Error('无法读取测试服务输出')
      stdout.on('data', (数据: Buffer): void => this.标准输出.追加(数据))
      stderr.on('data', (数据: Buffer): void => this.错误输出.追加(数据))
      stdout.pipe(process.stdout, { end: false })
      stderr.pipe(process.stderr, { end: false })
      let 日志选项 = { signal: this.日志控制器.signal }
      this.日志任务 = Promise.allSettled([
        pipeline(stdout, fs.createWriteStream(path.join(this.报告目录, 'server.stdout.log')), 日志选项),
        pipeline(stderr, fs.createWriteStream(path.join(this.报告目录, 'server.stderr.log')), 日志选项),
      ])

      let 截止时间 = Date.now() + 120_000
      while (Date.now() < 截止时间) {
        let 开放 = await this.端口已开放(端口)
        this.检查未关闭()
        if (启动错误 !== undefined) throw 启动错误
        if (进程.exitCode !== null || 进程.signalCode !== null)
          throw new Error(`测试服务在就绪前退出，退出码：${String(进程.exitCode)}，信号：${String(进程.signalCode)}`)
        if (开放) return 服务地址
        await 等待(250)
      }
      throw new Error(`等待测试服务端口 ${String(端口)} 就绪超时（120000ms）`)
    } catch (错误) {
      try {
        await this.关闭()
      } catch (关闭错误) {
        throw new AggregateError([错误, 关闭错误], '测试服务启动失败，且未能正常关闭')
      }
      throw 错误
    }
  }

  public 关闭(): Promise<void> {
    this.关闭任务 ??= this.结束服务进程()
    return this.关闭任务
  }

  public async 等待退出(): Promise<void> {
    let 进程 = this.进程
    if (进程 === undefined) throw new Error('测试服务尚未启动')
    if (进程.exitCode !== null || 进程.signalCode !== null) return
    await new Promise<void>((完成) => 进程.once('exit', (): void => 完成()))
  }

  private 获得配置(): { 端口: number; 服务地址: string } {
    let 端口 = z.coerce.number().int().min(1).max(65535).parse(process.env['APP_PORT'])
    return { 端口, 服务地址: `http://127.0.0.1:${String(端口)}` }
  }

  private 检查未关闭(): void {
    if (this.关闭任务 !== undefined) throw new Error('测试服务已关闭')
  }

  private 端口已开放(端口: number): Promise<boolean> {
    return new Promise<boolean>((完成) => {
      let 连接 = net.createConnection({ host: '127.0.0.1', port: 端口 })
      let 结束 = (开放: boolean): void => {
        连接.destroy()
        完成(开放)
      }
      连接.setTimeout(500)
      连接.once('connect', (): void => 结束(true))
      连接.once('timeout', (): void => 结束(false))
      连接.once('error', (): void => 结束(false))
    })
  }

  private 等待进程退出(进程: ChildProcess, 超时毫秒: number): Promise<boolean> {
    if (进程.exitCode !== null || 进程.signalCode !== null) return Promise.resolve(true)
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

  private async 结束服务进程(): Promise<void> {
    let 进程 = this.进程
    if (进程?.pid !== undefined && 进程.exitCode === null && 进程.signalCode === null) {
      if (process.platform === 'win32') {
        let 终止 = crossSpawn('taskkill', ['/pid', String(进程.pid), '/T', '/F'], { stdio: 'ignore' })
        await new Promise<void>((完成, 失败) => {
          终止.once('close', (退出码): void => {
            if (退出码 === 0 || 进程.exitCode !== null || 进程.signalCode !== null) 完成()
            else 失败(new Error(`taskkill 未能关闭测试服务进程，退出码：${String(退出码)}`))
          })
          终止.once('error', 失败)
        })
      } else process.kill(-进程.pid, 'SIGTERM')
      // POSIX 任务入口需要先通知独立子进程组，并给它们最多 11 秒完成退出。
      let 退出期限 = process.platform === 'win32' ? 10_000 : 15_000
      if ((await this.等待进程退出(进程, 退出期限)) === false) {
        if (process.platform === 'win32') 进程.kill('SIGKILL')
        else process.kill(-进程.pid, 'SIGKILL')
        if ((await this.等待进程退出(进程, 1_000)) === false) throw new Error('测试服务进程未在关闭期限内退出')
      }
    }

    if (this.日志任务 === undefined) return
    // 任务入口异常退出时，仍在运行的子进程可能继续占用输出管道。
    let 定时器 = setTimeout((): void => this.日志控制器.abort(), 5_000)
    try {
      let 日志结果们 = await this.日志任务
      for (let 结果 of 日志结果们)
        if (结果.status === 'rejected') throw new Error('保存测试服务日志失败', { cause: 结果.reason })
    } finally {
      clearTimeout(定时器)
    }
  }
}
