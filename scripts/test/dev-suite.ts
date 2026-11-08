import { mkdir, mkdtemp } from 'node:fs/promises'
import path from 'node:path'

import { 获得测试MCP配置, 获得环境变量 } from '../../src/global/env'
import { 项目根目录 } from '../task/model/task-common'
import { 独占测试数据库 } from './database-lock'
import type { 启动测试MCP } from './mcp/http'
import type { MCP测试会话 } from './mcp/session'
import { 测试服务 } from './test-server'

async function 运行开发套件(): Promise<void> {
  let 配置 = 获得环境变量()
  if (配置.NODE_ENV !== 'test' || 配置.BUILD_TARGET !== 'web') throw new Error('测试开发套件仅允许使用 Web 测试环境')
  let MCP配置 = 获得测试MCP配置()
  if (MCP配置.启用 && [配置.APP_PORT, 配置.WEB_PORT, 配置.WEB_HMR_PORT].includes(MCP配置.端口))
    throw new Error('TEST_MCP_PORT 必须与测试后端、前端和热更新端口不同')

  let 报告根目录 = path.join(项目根目录, 'test-outputs', 'test-dev')
  await mkdir(报告根目录, { recursive: true })
  let 输出目录 = await mkdtemp(path.join(报告根目录, `${String(Date.now())}-`))
  let 后端 = new 测试服务(项目根目录, 输出目录, 'run:service:test:watch')
  let MCP: Awaited<ReturnType<typeof 启动测试MCP>> | undefined
  let 会话: MCP测试会话 | undefined
  let 退出请求 = Promise.withResolvers<void>()
  let 请求退出 = (): void => 退出请求.resolve()
  let 释放数据库 = await 独占测试数据库(项目根目录)
  process.once('SIGINT', 请求退出)
  process.once('SIGTERM', 请求退出)
  try {
    let 后端地址 = await Promise.race([后端.启动(), 退出请求.promise])
    if (后端地址 === undefined) return
    let 前端地址 = `http://localhost:${String(配置.WEB_PORT)}`
    console.log(`测试前端：${前端地址}，测试后端：${后端地址}`)
    if (MCP配置.启用) {
      let { MCP测试会话 } = await import('./mcp/session')
      let { 启动测试MCP } = await import('./mcp/http')
      会话 = new MCP测试会话(项目根目录, 输出目录, 后端, 前端地址)
      await 会话.操作记录.初始化()
      MCP = await 启动测试MCP(会话, MCP配置.端口)
      console.log(`测试 MCP：${MCP.地址}`)
    }
    await Promise.race([
      退出请求.promise,
      后端.等待退出().then((): never => {
        throw new Error('测试后端监听任务已退出')
      }),
    ])
  } finally {
    process.off('SIGINT', 请求退出)
    process.off('SIGTERM', 请求退出)
    try {
      try {
        await MCP?.关闭()
      } finally {
        let 结果们 = await Promise.allSettled([会话?.关闭(), 后端.关闭()])
        let 错误们 = 结果们.filter((结果) => 结果.status === 'rejected').map((结果) => 结果.reason)
        if (错误们.length > 0) throw new AggregateError(错误们, '关闭测试开发套件失败')
      }
    } finally {
      await 释放数据库()
    }
  }
}

try {
  await 运行开发套件()
} catch (错误) {
  console.error(错误)
  process.exitCode = 1
}
