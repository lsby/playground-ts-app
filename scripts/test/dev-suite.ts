import { spawn, type SpawnOptions } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, open } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

import { 获得测试MCP配置, 获得环境变量 } from '../../src/global/env'
import { 项目根目录 } from '../task/model/task-common'
import { 开发任务表 } from '../task/taskfile/taskfile-dev'
import { 独占测试数据库 } from './database-lock'
import { 开放关闭接口, 请求关闭开发套件 } from './dev-control'
import type { 启动测试MCP } from './mcp/http'
import type { MCP测试会话 } from './mcp/session'
import { 停止测试进程, 测试端口已开放, 等待测试进程输出 } from './test-process'
import { 测试服务 } from './test-server'

type 子任务 = { 完成: Promise<void>; 关闭: () => Promise<void> }

function 启动子任务(
  名称: string,
  参数: string[],
  标准输出: 'inherit' | number = 'inherit',
  等待就绪?: { 输出行: string; 信号: AbortSignal },
): 子任务 & { 就绪?: Promise<void> } {
  let 选项: SpawnOptions = {
    cwd: 项目根目录,
    stdio: ['ignore', 等待就绪 === undefined ? 标准输出 : 'pipe', 标准输出],
    detached: process.platform !== 'win32',
    windowsHide: true,
  }
  let 进程 = spawn(process.execPath, ['--import', 'tsx', ...参数], 选项)
  let 完成 = new Promise<void>((成功, 失败) => {
    进程.once('error', 失败)
    进程.once('close', (退出码, 信号): void => {
      if (退出码 === 0) 成功()
      else 失败(new Error(`${名称}退出，退出码：${String(退出码)}，信号：${String(信号)}`))
    })
  })
  // 并行启动期间也可能提前退出，调用方会在竞速或清理时读取结果。
  void 完成.catch((): void => {})
  let 关闭 = async (): Promise<void> => 停止测试进程(进程, 13_000)
  if (等待就绪 === undefined) return { 完成, 关闭 }
  let 就绪 = 等待测试进程输出(进程, 等待就绪.输出行, 等待就绪.信号)
  void 就绪.catch((): void => {})
  进程.stdout?.pipe(process.stdout, { end: false })
  return { 完成, 关闭, 就绪 }
}

async function 确认前端就绪(地址: string, 信号: AbortSignal): Promise<void> {
  let 响应 = await fetch(地址, { signal: AbortSignal.any([信号, AbortSignal.timeout(10_000)]) })
  await 响应.body?.cancel()
  if (响应.ok === false) throw new Error(`测试前端返回 HTTP ${String(响应.status)}，请检查前端构建输出`)
}

function 异常退出(完成: Promise<void>, 名称: string): Promise<never> {
  let 结果 = 完成.then((): never => {
    throw new Error(`${名称}意外退出`)
  })
  void 结果.catch((): void => {})
  return 结果
}

async function 运行开发套件(回放构建: boolean): Promise<void> {
  let 配置 = 获得环境变量()
  if (配置.NODE_ENV !== 'test' || 配置.BUILD_TARGET !== 'web') throw new Error('测试开发套件仅允许使用 Web 测试环境')
  let MCP配置 = 获得测试MCP配置()
  let 使用端口 = 回放构建 ? [配置.APP_PORT] : [配置.APP_PORT, 配置.WEB_PORT, 配置.WEB_HMR_PORT]
  if (MCP配置.启用) 使用端口.push(MCP配置.端口)
  if (new Set(使用端口).size !== 使用端口.length) throw new Error('测试开发套件各项服务必须使用不同端口')
  let 本地命令目录 = path.join(项目根目录, 'node_modules', '.bin')
  process.env['PATH'] = [本地命令目录, process.env['PATH']].join(path.delimiter)

  let 取消 = new AbortController()
  let 已取消 = (): boolean => 取消.signal.aborted
  let 退出请求 = Promise.withResolvers<void>()
  let 请求退出 = (): void => {
    退出请求.resolve()
    取消.abort(new Error('测试开发套件正在关闭'))
  }
  process.on('SIGINT', 请求退出)
  process.on('SIGTERM', 请求退出)

  let 后端: 测试服务 | undefined
  let MCP: Awaited<ReturnType<typeof 启动测试MCP>> | undefined
  let 会话: MCP测试会话 | undefined
  let 释放数据库: Awaited<ReturnType<typeof 独占测试数据库>> | undefined
  let 关闭接口: Awaited<ReturnType<typeof 开放关闭接口>> | undefined
  let 子任务们: 子任务[] = []
  try {
    释放数据库 = await 独占测试数据库(项目根目录)
    if (已取消()) return
    let 报告根目录 = path.join(项目根目录, 'test-outputs', 'test-dev')
    await mkdir(报告根目录, { recursive: true })
    let 输出目录 = await mkdtemp(path.join(报告根目录, `${String(Date.now())}-`))
    let 实例标识 = randomUUID()
    关闭接口 = await 开放关闭接口(实例标识, 请求退出)
    let 环境文件 = z.string().min(1).parse(process.env['ENV_FILE_PATH'])
    后端 = new 测试服务(项目根目录, 输出目录, 回放构建 ? 'run:service:test' : 'run:service:test:watch')
    await 后端.确认端口可用()
    if (MCP配置.启用 && (await 测试端口已开放(MCP配置.端口)))
      throw new Error(`测试 MCP 端口 ${String(MCP配置.端口)} 已被占用`)
    if (回放构建 === false)
      for (let 端口 of [配置.WEB_PORT, 配置.WEB_HMR_PORT])
        if (await 测试端口已开放(端口, 'localhost')) throw new Error(`测试前端端口 ${String(端口)} 已被占用`)

    let 启动项目任务 = (名称: string, 标准输出?: number): 子任务 => {
      let 任务 = 启动子任务(名称, ['scripts/task/index.ts', 名称, '--env', 环境文件], 标准输出)
      子任务们.push(任务)
      return 任务
    }
    let 等待项目任务 = async (名称: string): Promise<void> => {
      if (已取消() === false) await Promise.race([启动项目任务(名称).完成, 退出请求.promise])
    }
    if (回放构建) {
      await 等待项目任务('db:ensure:test:web')
      await 等待项目任务('build:web:test')
    } else await 等待项目任务('dev:test:prepare')
    if (已取消()) return

    let 子任务退出们: Promise<never>[] = []
    let 前端地址 = `http://localhost:${String(配置.WEB_PORT)}`
    let 前端就绪: Promise<void> | undefined
    if (回放构建 === false) {
      // Parcel 输出开发服务器地址后，再确认页面可以访问。
      let 前端 = 启动子任务('测试前端', 开发任务表['run:web:test:dev'].运行.参数, 'inherit', {
        输出行: `Server running at ${前端地址}`,
        信号: 取消.signal,
      })
      前端就绪 = 前端.就绪
      子任务们.push(前端)
      子任务退出们.push(异常退出(前端.完成, '测试前端'))
    }
    let 后端地址 = await Promise.race([后端.启动(), 退出请求.promise, ...子任务退出们])
    if (后端地址 === undefined) return
    子任务退出们.push(异常退出(后端.等待退出(), '测试后端'))
    if (回放构建) 前端地址 = 后端地址
    let 确认可访问 = async (): Promise<void> => {
      await 前端就绪
      await 确认前端就绪(前端地址, 取消.signal)
    }
    await Promise.race([确认可访问(), 退出请求.promise, ...子任务退出们])
    if (已取消()) return

    if (回放构建 === false) {
      let 日志文件 = await open(path.join(输出目录, 'watch.log'), 'a')
      try {
        let 监听任务 = 启动项目任务('dev:test:watch', 日志文件.fd)
        子任务退出们.push(异常退出(监听任务.完成, '测试监听任务'))
      } finally {
        await 日志文件.close()
      }
    }
    if (MCP配置.启用 && 已取消() === false) {
      let { MCP测试会话 } = await import('./mcp/session')
      let { 启动测试MCP } = await import('./mcp/http')
      会话 = new MCP测试会话(项目根目录, 输出目录, 后端, 前端地址)
      await 会话.操作记录.初始化()
      if (已取消() === false) MCP = await 启动测试MCP(会话, MCP配置.端口)
    }
    if (已取消()) return
    let 就绪信息 = {
      mcpUrl: MCP?.地址 ?? null,
      frontendUrl: 前端地址,
      backendUrl: 后端地址,
      outputDir: 输出目录,
      stopId: 实例标识,
    }
    console.log(`TEST_DEV_READY ${JSON.stringify(就绪信息)}`)
    await Promise.race([退出请求.promise, ...子任务退出们])
  } finally {
    请求退出()
    let 关闭成功 = false
    try {
      后端?.取消启动或重启()
      let MCP结果们 = await Promise.allSettled([MCP?.关闭(), 会话?.关闭()])
      let 服务结果们 = await Promise.allSettled([后端?.关闭(), ...子任务们.map((任务) => 任务.关闭())])
      释放数据库?.()
      let 错误们 = [...MCP结果们, ...服务结果们].filter((结果) => 结果.status === 'rejected').map((结果) => 结果.reason)
      if (错误们.length > 0) throw new AggregateError(错误们, '关闭测试开发套件失败')
      关闭成功 = true
    } finally {
      await 关闭接口?.(关闭成功)
      process.off('SIGINT', 请求退出)
      process.off('SIGTERM', 请求退出)
    }
  }
}

try {
  let 参数 = process.argv.slice(2)
  if (参数[0] === '--stop' && 参数.length === 2) await 请求关闭开发套件(z.string().uuid().parse(参数[1]))
  else if (参数.length === 0 || (参数[0] === '--replay-build' && 参数.length === 1))
    await 运行开发套件(参数[0] === '--replay-build')
  else throw new Error('测试开发套件仅接受 --replay-build 或 --stop <stopId>')
} catch (错误) {
  console.error(错误)
  process.exitCode = 1
}
