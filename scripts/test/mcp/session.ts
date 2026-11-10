import { addAbortListener } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import crossSpawn from 'cross-spawn'
import { z } from 'zod'

import type { 提交步骤附件, 流程步骤附件, 测试服务日志内容, 需求测试工具 } from '../../../src/model/test-requirement'
import { 测试操作记录 } from '../../../src/test-tools/operation-record'
import { 测试运行工具 } from '../../../src/test-tools/runtime'
import { 停止测试进程 } from '../test-process'
import type { 测试服务 } from '../test-server'
import type { MCP测试工具宿主 } from './tools'

type 调用结果<结果> = { 成功: true; 值: 结果 } | { 成功: false; 错误: string }
type 调用附件 = { 路径: string; 说明?: string }

function 错误文本(错误: unknown): string {
  return 错误 instanceof Error ? 错误.message : String(错误)
}

async function 运行数据库重置任务(项目根目录: string, 取消信号: AbortSignal): Promise<void> {
  取消信号.throwIfAborted()
  let 环境文件 = z.string().min(1).parse(process.env['ENV_FILE_PATH'])
  // 直接执行 test:requirement:reset 的叶脚本，避免任务入口派生独立的进程组。
  let 进程 = crossSpawn(process.execPath, ['--import', 'tsx', 'scripts/test/requirement/reset-database.ts'], {
    cwd: 项目根目录,
    env: { ...process.env, ENV_FILE_PATH: 环境文件 },
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: process.platform !== 'win32',
    windowsHide: true,
  })
  let 启动错误: Error | undefined
  进程.once('error', (错误): void => {
    启动错误 = 错误
  })
  let 已退出 = new Promise<{ 退出码: number | null; 信号: NodeJS.Signals | null }>((完成) => {
    进程.once('close', (退出码, 信号): void => 完成({ 退出码, 信号 }))
  })
  let 取消 = Promise.withResolvers<void>()
  let 监听 = addAbortListener(取消信号, (): void => 取消.resolve())
  try {
    let 结果 = await Promise.race([已退出, 取消.promise])
    if (结果 === undefined) {
      try {
        await 停止测试进程(进程, 2_000)
      } finally {
        await 已退出
      }
      throw new Error('测试数据库重置已取消', { cause: 取消信号.reason })
    }
    if (启动错误 !== undefined) throw 启动错误
    if (结果.退出码 !== 0)
      throw new Error(`测试数据库重置任务失败，退出码：${String(结果.退出码)}，信号：${String(结果.信号)}`)
  } finally {
    监听[Symbol.dispose]()
  }
}

/** 开发套件保有一个测试现场，每次 MCP 工具调用独立收集证据。 */
export class MCP测试会话 implements MCP测试工具宿主 {
  public readonly 操作记录: 测试操作记录
  private readonly 运行工具: 测试运行工具
  private readonly 取消 = new AbortController()
  private 调用序号 = 0
  private 执行中 = 0
  private 重置调用: Promise<unknown> | undefined
  private 关闭任务: Promise<void> | undefined

  public constructor(
    private readonly 项目根目录: string,
    private readonly 输出目录: string,
    private readonly 后端: 测试服务,
    private readonly 前端地址: string,
  ) {
    this.操作记录 = new 测试操作记录(输出目录)
    this.运行工具 = new 测试运行工具({
      项目根目录,
      服务: {
        获得服务地址: (): string => 前端地址,
        获得后端地址: (): string => 后端.获得服务地址(),
        获得日志位置: (): ReturnType<测试服务['获得日志位置']> => 后端.获得日志位置(),
        读取日志: (起点): 测试服务日志内容 => 后端.读取日志(起点),
      },
      附件目录: 输出目录,
      模式: '自动',
      取消信号: this.取消.signal,
    })
  }

  public 获得输出目录(): string {
    return this.输出目录
  }

  public 获得测试地址(): { 前端: string; 后端: string } {
    return { 前端: this.前端地址, 后端: this.后端.获得服务地址() }
  }

  public 读取后端日志(): 测试服务日志内容 {
    this.检查开放()
    return this.后端.读取日志({ 标准输出: 0, 错误输出: 0 })
  }

  public async 执行工具<结果>(调用: () => Promise<结果>, 重置 = false): Promise<结果> {
    this.检查开放()
    if (this.重置调用 !== undefined) throw new Error('测试数据库正在重置')
    if (重置) {
      if (this.执行中 > 0) throw new Error('仍有测试工具正在执行，暂不能重置数据库')
      let 本次重置 = Promise.resolve().then(调用)
      this.重置调用 = 本次重置
      try {
        return await 本次重置
      } finally {
        this.重置调用 = undefined
      }
    }
    this.执行中 += 1
    try {
      return await 调用()
    } finally {
      this.执行中 -= 1
    }
  }

  public async 重置数据库(清空记录: boolean): Promise<{ reset: true; recordCleared: boolean }> {
    this.检查开放()
    await this.运行工具.关闭当前现场()
    this.检查开放()
    await this.后端.重启((信号) => 运行数据库重置任务(this.项目根目录, 信号))
    if (清空记录) {
      try {
        await this.操作记录.清空()
      } catch (错误) {
        throw new Error(`测试数据库已重置，清空操作记录失败：${错误文本(错误)}`, { cause: 错误 })
      }
    }
    return { reset: true, recordCleared: 清空记录 }
  }

  public async 执行<结果>(
    调用: (工具: 需求测试工具, 提交: 提交步骤附件) => Promise<结果>,
  ): Promise<{ 结果: 调用结果<结果>; 附件们: readonly 调用附件[]; 取证错误们: readonly string[] }> {
    this.检查开放()
    this.后端.确认已就绪()
    this.调用序号 += 1
    let 序号 = this.调用序号
    let 证据们: 流程步骤附件[] = []
    let 取证错误们: string[] = []
    let 提交: 提交步骤附件 = (附件们) => {
      for (let 附件 of 附件们) 证据们.push(附件)
    }
    let 记录错误 = (错误: unknown): void => {
      取证错误们.push(错误文本(错误))
    }
    let 结果: 调用结果<结果>
    try {
      let 值 = await this.运行工具.执行步骤(提交, 记录错误, () => 调用(this.运行工具.工具, 提交))
      结果 = { 成功: true, 值 }
    } catch (错误) {
      结果 = { 成功: false, 错误: 错误文本(错误) }
    }
    let 附件们 = await this.保存证据(序号, 证据们, 记录错误)
    return { 结果, 附件们, 取证错误们 }
  }

  public 关闭(): Promise<void> {
    this.关闭任务 ??= this.清理()
    return this.关闭任务
  }

  private 检查开放(): void {
    if (this.关闭任务 !== undefined) throw new Error('MCP 测试会话正在关闭')
  }

  private async 保存证据(
    序号: number,
    证据们: readonly 流程步骤附件[],
    记录错误: (错误: unknown) => void,
  ): Promise<调用附件[]> {
    if (证据们.length === 0) return []
    let 目录 = path.join(this.输出目录, 'calls', String(序号))
    try {
      await mkdir(目录, { recursive: true })
    } catch (错误) {
      记录错误(错误)
      return []
    }
    let 文件们: 调用附件[] = []
    for (let [索引, 证据] of 证据们.entries()) {
      try {
        let 文件名 = String(索引 + 1)
        switch (证据.类型) {
          case '文本': {
            let 路径 = path.join(目录, `${文件名}.txt`)
            await writeFile(路径, 证据.内容, 'utf8')
            文件们.push({ 路径 })
            break
          }
          case '图片': {
            let 路径 = path.join(目录, `${文件名}.${证据.内容类型.slice('image/'.length)}`)
            await writeFile(路径, Buffer.from(证据.内容, 'base64'))
            文件们.push(证据.说明 === undefined ? { 路径 } : { 路径, 说明: 证据.说明 })
            break
          }
        }
      } catch (错误) {
        记录错误(错误)
      }
    }
    return 文件们
  }

  private async 清理(): Promise<void> {
    let 错误们: unknown[] = []
    try {
      await this.重置调用?.catch((): void => {
        // 重置调用负责报告自身的错误，关闭等待它释放当前现场。
      })
      if (this.执行中 === 0) {
        await this.运行工具.收集附件((错误): void => console.error(错误))
      }
    } catch (错误) {
      错误们.push(错误)
    } finally {
      this.取消.abort()
      try {
        await this.运行工具.关闭()
      } catch (错误) {
        错误们.push(错误)
      }
    }
    if (错误们.length > 0) throw new AggregateError(错误们, '关闭 MCP 测试会话失败')
  }
}
