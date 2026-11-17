import { chromium } from '@playwright/test'
import { spawn, type SpawnOptions } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, open } from 'node:fs/promises'
import path from 'node:path'
import { inspect, parseArgs } from 'node:util'
import { z } from 'zod'

import { 检查浏览器已安装 } from '../../src/model/browser-test/browser-install'
import { 读取移动测试配置 } from '../../src/test-tools/mobile-config'

import { 苹果网络中转, 计算苹果中转端口 } from '../../src/model/ios-test/network-relay'
import { 项目根目录 } from '../task/model/task-common'
import { 开发任务表 } from '../task/taskfile/taskfile-dev'
import { 独占测试数据库 } from './database-lock'
import { 开放关闭接口, 请求关闭开发套件 } from './dev-control'
import type { 启动测试MCP } from './mcp/http'
import type { MCP测试会话 } from './mcp/session'
import { 清理同目录残留进程 } from './stale-process'
import { 创建测试子进程环境, 检查测试命令环境 } from './test-environment'
import { 停止测试进程, 测试端口已开放, 等待测试进程输出 } from './test-process'
import { 测试服务 } from './test-server'

type 子任务 = { 完成: Promise<void>; 关闭: () => Promise<void> }

function 启动子任务(
  名称: string,
  参数: string[],
  标准输出: 'inherit' | number = 'inherit',
  等待就绪?: { 输出行: string; 信号: AbortSignal },
  额外环境?: Record<string, string>,
): 子任务 & { 就绪?: Promise<void> } {
  let 选项: SpawnOptions = {
    cwd: 项目根目录,
    ...(额外环境 === undefined ? {} : { env: { ...process.env, ...额外环境 } }),
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
  // Parcel 打印「Server running」后端口偶尔还没真正接受连接，连接被拒绝时短暂重试
  let 截止 = Date.now() + 15_000
  while (true) {
    try {
      let 响应 = await fetch(地址, { signal: AbortSignal.any([信号, AbortSignal.timeout(10_000)]) })
      await 响应.body?.cancel()
      if (响应.ok === false) throw new Error(`测试前端返回 HTTP ${String(响应.status)}，请检查前端构建输出`)
      return
    } catch (错误) {
      if (信号.aborted || Date.now() > 截止 || 错误 instanceof TypeError === false) throw 错误
      await new Promise((完成): void => void setTimeout(完成, 500))
    }
  }
}

function 异常退出(完成: Promise<void>, 名称: string): Promise<never> {
  let 结果 = 完成.then((): never => {
    throw new Error(`${名称}意外退出`)
  })
  void 结果.catch((): void => {})
  return 结果
}

async function 运行开发套件(
  回放构建: boolean,
  安卓设备: string | undefined,
  苹果设备: string | undefined,
  带检查监听: boolean,
  读取环境: 测试开发环境读取器,
): Promise<void> {
  if (安卓设备 !== undefined && 苹果设备 !== undefined) throw new Error('--device 和 --ios-device 不能同时使用')
  if (安卓设备 !== undefined || 苹果设备 !== undefined) {
    let 移动配置 = await 读取移动测试配置(项目根目录)
    if (安卓设备 !== undefined && 移动配置.Android === undefined) throw new Error('项目未配置 Android 测试能力')
    if (苹果设备 !== undefined && 移动配置.iOS === undefined) throw new Error('项目未配置 iOS 测试能力')
  }
  let { 配置, MCP配置 } = await 读取环境()
  if (配置.NODE_ENV !== 'test' || 配置.BUILD_TARGET !== 'web') throw new Error('测试开发套件仅允许使用 Web 测试环境')
  let 使用端口 = 回放构建 ? [配置.APP_PORT] : [配置.APP_PORT, 配置.WEB_PORT, 配置.WEB_HMR_PORT]
  if (MCP配置.启用) 使用端口.push(MCP配置.端口)
  if (苹果设备 !== undefined) 使用端口.push(计算苹果中转端口(配置.APP_PORT))
  if (new Set(使用端口).size !== 使用端口.length) throw new Error('测试开发套件各项服务必须使用不同端口')
  await 检查测试命令环境(项目根目录)
  process.env['PATH'] = 创建测试子进程环境(项目根目录)['PATH']

  let 取消 = new AbortController()
  let 已取消 = (): boolean => 取消.signal.aborted
  let 退出请求 = Promise.withResolvers<void>()
  let 请求退出 = (): void => {
    退出请求.resolve()
    取消.abort(new Error('测试开发套件正在关闭'))
  }
  process.on('SIGINT', 请求退出)
  process.on('SIGTERM', 请求退出)
  process.on('SIGHUP', 请求退出)
  // 上层任务进程（task 入口）被 SIGKILL 或异常消失时，这里收不到信号：盯着父进程，没了就自己走完正常关闭流程，
  // 这样后端、前端、监听子进程不会变成孤儿
  let 父进程 = process.ppid
  let 父进程监视 = setInterval((): void => {
    try {
      process.kill(父进程, 0)
    } catch {
      请求退出()
    }
  }, 2_000)
  父进程监视.unref()

  let 后端: 测试服务 | undefined
  let MCP: Awaited<ReturnType<typeof 启动测试MCP>> | undefined
  let 会话: MCP测试会话 | undefined
  let 释放数据库: Awaited<ReturnType<typeof 独占测试数据库>> | undefined
  let 关闭接口: Awaited<ReturnType<typeof 开放关闭接口>> | undefined
  let 子任务们: 子任务[] = []
  // iOS 网络中转随 dev:test 启停：iOS 会话关闭或重置只恢复在线，不关闭监听，电脑浏览器和下次打开会话都不受影响。
  let 苹果中转: 苹果网络中转 | undefined
  try {
    // 上次 dev:test 被强杀时可能留下占着端口的后端/前端进程：同目录的自动关掉，别处的不动（后面的端口检查照旧报错）
    await 清理同目录残留进程(项目根目录, [
      { 端口: 配置.APP_PORT, 主机: '127.0.0.1' },
      ...(回放构建
        ? []
        : [
            { 端口: 配置.WEB_PORT, 主机: 'localhost' },
            { 端口: 配置.WEB_HMR_PORT, 主机: 'localhost' },
          ]),
      ...(MCP配置.启用 ? [{ 端口: MCP配置.端口, 主机: '127.0.0.1' }] : []),
      ...(苹果设备 === undefined ? [] : [{ 端口: 计算苹果中转端口(配置.APP_PORT), 主机: '127.0.0.1' }]),
    ])
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

    if (苹果设备 !== undefined) {
      let 中转端口 = 计算苹果中转端口(配置.APP_PORT)
      if (await 测试端口已开放(中转端口)) throw new Error(`iOS 网络中转端口 ${String(中转端口)} 已被占用`)
      苹果中转 = new 苹果网络中转(中转端口, 配置.APP_PORT, (消息): void => console.error(`[iOS 网络中转] ${消息}`))
      await 苹果中转.启动()
    }
    // 新 worktree 里 Playwright 浏览器常常没装，提前提示，避免第一次 browser_open 才失败
    let 浏览器提示 = 检查浏览器已安装(chromium.executablePath())
    if (浏览器提示 !== undefined) console.warn(`[浏览器] ${浏览器提示}`)
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
      let 前端 = 启动子任务(
        '测试前端',
        开发任务表['run:web:test:dev'].运行.参数,
        'inherit',
        { 输出行: `Server running at ${前端地址}`, 信号: 取消.signal },
        苹果设备 === undefined
          ? undefined
          : {
              // 前端代理只把 iOS 测试包（User-Agent 带标记）的接口请求转进 iOS 网络中转，ios_network 的 offline/hang 才对接口生效；浏览器直连后端。
              PROXY_BACKEND_PORT: String(计算苹果中转端口(配置.APP_PORT)),
            },
      )
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
        let 监听任务 = 启动项目任务(带检查监听 ? 'dev:test:watch:checks' : 'dev:test:watch', 日志文件.fd)
        子任务退出们.push(异常退出(监听任务.完成, '测试监听任务'))
      } finally {
        await 日志文件.close()
      }
    }
    if (MCP配置.启用 && 已取消() === false) {
      let { MCP测试会话 } = await import('./mcp/session')
      let { 启动测试MCP } = await import('./mcp/http')
      会话 = new MCP测试会话(
        项目根目录,
        输出目录,
        后端,
        前端地址,
        安卓设备,
        苹果设备,
        回放构建 === false,
        配置.WEB_HMR_PORT,
        苹果中转,
      )
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
      let 中转错误: unknown[] = []
      if (苹果中转 !== undefined) await 苹果中转.关闭().catch((错误: unknown): void => void 中转错误.push(错误))
      释放数据库?.()
      let 错误们 = [...MCP结果们, ...服务结果们]
        .filter((结果) => 结果.status === 'rejected')
        .map((结果) => 结果.reason)
        .concat(中转错误)
      if (错误们.length > 0) throw new AggregateError(错误们, '关闭测试开发套件失败')
      关闭成功 = true
    } finally {
      await 关闭接口?.(关闭成功)
      clearInterval(父进程监视)
      process.off('SIGINT', 请求退出)
      process.off('SIGTERM', 请求退出)
      process.off('SIGHUP', 请求退出)
    }
  }
}

export type 测试开发环境读取器 = () => Promise<{
  配置: { NODE_ENV: string; BUILD_TARGET: string; APP_PORT: number; WEB_PORT: number; WEB_HMR_PORT: number }
  MCP配置: { 启用: false } | { 启用: true; 端口: number }
}>

export async function 执行测试开发套件(读取环境: 测试开发环境读取器): Promise<void> {
  try {
    let { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        stop: { type: 'string' },
        'replay-build': { type: 'boolean' },
        device: { type: 'string' },
        'ios-device': { type: 'string' },
        'with-checks': { type: 'boolean' },
      },
    })
    let 安卓设备 = values.device === undefined ? undefined : z.string().trim().min(1).parse(values.device)
    let 苹果设备 = values['ios-device'] === undefined ? undefined : z.string().trim().min(1).parse(values['ios-device'])
    if (values.stop !== undefined) {
      if (
        values['replay-build'] === true ||
        安卓设备 !== undefined ||
        苹果设备 !== undefined ||
        values['with-checks'] === true
      )
        throw new Error('--stop 不能与其他选项一起使用')
      await 请求关闭开发套件(z.string().uuid().parse(values.stop))
    } else
      await 运行开发套件(values['replay-build'] === true, 安卓设备, 苹果设备, values['with-checks'] === true, 读取环境)
  } catch (错误) {
    console.error(inspect(错误, { depth: null }))
    process.exitCode = 1
  }
}
