import type { ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { setTimeout as 等待 } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import crossSpawn from 'cross-spawn'
import { z } from 'zod'

import type { 测试服务日志内容 } from '../../src/model/test-requirement/tools'
import type { 测试服务日志位置 } from '../../src/test-tools/runtime'
import { 开发任务表 } from '../task/taskfile/taskfile-dev'
import { 测试日志缓冲 } from './service-log'
import { 停止测试进程 } from './test-process'

type 后端进程 = {
  子进程: ChildProcess
  已就绪: boolean
  日志控制器: AbortController
  日志任务?: Promise<PromiseSettledResult<void>[]>
  停止任务?: Promise<void> | undefined
}

/**
 * 测试服务是为一次需求测试运行提供后端的独立进程。
 * 它关联项目中的启动任务和报告位置，记录本次启动和关闭状态。
 * 测试运行器通过它等待后端就绪、获取服务地址，并在结束时停止进程、保存日志。
 */
export class 测试服务 {
  private 已尝试启动 = false
  private 进程: 后端进程 | undefined
  private readonly 意外退出 = Promise.withResolvers<void>()
  private readonly 取消 = new AbortController()
  private 重启任务: Promise<string> | undefined
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

  public 确认已就绪(): void {
    if (this.进程?.已就绪 !== true) throw new Error('测试后端未就绪，请重试 database_reset')
  }

  public 获得日志位置(): 测试服务日志位置 {
    return { 标准输出: this.标准输出.获得位置(), 错误输出: this.错误输出.获得位置() }
  }

  public 读取日志(起点: 测试服务日志位置): 测试服务日志内容 {
    return { 标准输出: this.标准输出.读取(起点.标准输出), 错误输出: this.错误输出.读取(起点.错误输出) }
  }

  public async 确认端口可用(): Promise<void> {
    let { 端口 } = this.获得配置()
    if (await this.端口已开放(端口)) throw new Error(`测试服务端口 ${String(端口)} 已被占用，请先关闭已有测试服务`)
  }

  public async 启动(): Promise<string> {
    if (this.已尝试启动) throw new Error('测试服务只能启动一次')
    this.检查未关闭()
    this.已尝试启动 = true
    return await this.启动进程()
  }

  public async 重启(停机期间操作: (取消信号: AbortSignal) => Promise<void>): Promise<string> {
    this.检查未关闭()
    if (this.启动任务 !== 'run:service:test:watch' || this.已尝试启动 === false)
      throw new Error('仅允许重启已启动的测试开发服务')
    if (this.重启任务 !== undefined) throw new Error('测试服务正在重启')
    this.重启任务 = this.执行重启(停机期间操作)
    try {
      return await this.重启任务
    } finally {
      this.重启任务 = undefined
    }
  }

  public 关闭(): Promise<void> {
    this.取消.abort(new Error('测试服务已关闭'))
    this.关闭任务 ??= this.执行关闭()
    return this.关闭任务
  }

  public 等待退出(): Promise<void> {
    if (this.已尝试启动 === false) throw new Error('测试服务尚未启动')
    return this.意外退出.promise
  }

  private async 执行重启(停机期间操作: (取消信号: AbortSignal) => Promise<void>): Promise<string> {
    await this.停止当前进程()
    await this.确认端口可用()
    this.检查未关闭()
    await 停机期间操作(this.取消.signal)
    return await this.启动进程()
  }

  private async 执行关闭(): Promise<void> {
    await this.重启任务?.catch((): void => {
      // 重启调用负责报告自己的失败。关闭继续处理任何仍在运行的后端。
    })
    await this.停止当前进程()
  }

  private async 启动进程(): Promise<string> {
    this.检查未关闭()
    let 环境文件 = z.string().min(1).parse(process.env['ENV_FILE_PATH'])
    let { 端口, 服务地址 } = this.获得配置()
    await this.确认端口可用()
    this.检查未关闭()

    fs.mkdirSync(this.报告目录, { recursive: true })
    let { 参数, 环境变量 } = this.获得启动命令(环境文件)
    let 进程 = crossSpawn(process.execPath, 参数, {
      cwd: this.根目录,
      env: 环境变量,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    })
    let 当前: 后端进程 = { 子进程: 进程, 已就绪: false, 日志控制器: new AbortController() }
    this.进程 = 当前
    let 启动错误: Error | undefined
    进程.once('error', (错误): void => {
      启动错误 = 错误
    })
    进程.once('exit', (): void => {
      if (当前.已就绪 && this.取消.signal.aborted === false) this.意外退出.resolve()
      当前.已就绪 = false
    })
    try {
      let { stdout, stderr } = 进程
      if (stdout === null || stderr === null) throw new Error('无法读取测试服务输出')
      stdout.on('data', (数据: Buffer): void => this.标准输出.追加(数据))
      stderr.on('data', (数据: Buffer): void => this.错误输出.追加(数据))
      stdout.pipe(process.stdout, { end: false })
      stderr.pipe(process.stderr, { end: false })
      let 日志选项 = { signal: 当前.日志控制器.signal }
      当前.日志任务 = Promise.allSettled([
        pipeline(stdout, fs.createWriteStream(path.join(this.报告目录, 'server.stdout.log'), { flags: 'a' }), 日志选项),
        pipeline(stderr, fs.createWriteStream(path.join(this.报告目录, 'server.stderr.log'), { flags: 'a' }), 日志选项),
      ])

      let 截止时间 = Date.now() + 120_000
      while (Date.now() < 截止时间) {
        let 开放 = await this.端口已开放(端口)
        this.检查未关闭()
        if (启动错误 !== undefined) throw 启动错误
        if (进程.exitCode !== null || 进程.signalCode !== null)
          throw new Error(`测试服务在就绪前退出，退出码：${String(进程.exitCode)}，信号：${String(进程.signalCode)}`)
        if (开放) {
          当前.已就绪 = true
          return 服务地址
        }
        await 等待(250)
      }
      throw new Error(`等待测试服务端口 ${String(端口)} 就绪超时（120000ms）`)
    } catch (错误) {
      try {
        await this.停止当前进程()
      } catch (关闭错误) {
        throw new AggregateError([错误, 关闭错误], '测试服务启动失败，且未能正常关闭')
      }
      throw 错误
    }
  }

  private 获得启动命令(环境文件: string): { 参数: string[]; 环境变量: NodeJS.ProcessEnv } {
    if (this.启动任务 === 'run:service:test:watch') {
      // 监听器和它派生的服务留在同一进程组，重置时可一起关闭。
      let 任务 = 开发任务表[this.启动任务]
      return {
        参数: [fileURLToPath(import.meta.resolve('tsx/cli')), ...任务.运行.参数],
        环境变量: { ...process.env, ...任务.环境变量, ENV_FILE_PATH: 环境文件 },
      }
    }
    return {
      参数: ['--import', 'tsx', 'scripts/task/index.ts', this.启动任务, '--env', 环境文件],
      环境变量: process.env,
    }
  }

  private 获得配置(): { 端口: number; 服务地址: string } {
    let 端口 = z.coerce.number().int().min(1).max(65535).parse(process.env['APP_PORT'])
    return { 端口, 服务地址: `http://127.0.0.1:${String(端口)}` }
  }

  private 检查未关闭(): void {
    this.取消.signal.throwIfAborted()
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

  private async 停止当前进程(): Promise<void> {
    let 当前 = this.进程
    if (当前 === undefined) return
    当前.已就绪 = false
    当前.停止任务 ??= this.结束服务进程(当前)
    try {
      await 当前.停止任务
    } finally {
      当前.停止任务 = undefined
    }
  }

  private async 结束服务进程(当前: 后端进程): Promise<void> {
    let 退出期限 = this.启动任务 === 'run:service:test:watch' ? 5_000 : 15_000
    await 停止测试进程(当前.子进程, 退出期限)
    // 任务入口异常退出时，仍在运行的子进程可能继续占用输出管道。
    let 定时器 = setTimeout((): void => 当前.日志控制器.abort(), 3_000)
    try {
      for (let 结果 of (await 当前.日志任务) ?? [])
        if (结果.status === 'rejected') throw new Error('保存测试服务日志失败', { cause: 结果.reason })
    } finally {
      clearTimeout(定时器)
      if (this.进程 === 当前) this.进程 = undefined
    }
  }
}
