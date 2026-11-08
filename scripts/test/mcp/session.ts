import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { 流程步骤附件, 测试服务日志内容, 需求测试工具 } from '../../../src/model/test-requirement'
import { 测试运行工具 } from '../../../src/test-tools/runtime'
import type { 测试服务 } from '../test-server'
import type { MCP测试工具宿主 } from './tools'

type 调用结果<结果> = { 成功: true; 值: 结果 } | { 成功: false; 错误: string }
type 调用附件 = { 路径: string; 说明?: string }

function 错误文本(错误: unknown): string {
  return 错误 instanceof Error ? 错误.message : String(错误)
}

/** 开发套件保有一个测试现场，每次 MCP 工具调用独立收集证据。 */
export class MCP测试会话 implements MCP测试工具宿主 {
  private readonly 运行工具: 测试运行工具
  private readonly 取消 = new AbortController()
  private 调用序号 = 0
  private 执行中 = 0
  private 关闭任务: Promise<void> | undefined

  public constructor(
    项目根目录: string,
    private readonly 输出目录: string,
    private readonly 后端: 测试服务,
    private readonly 前端地址: string,
  ) {
    this.运行工具 = new 测试运行工具({
      项目根目录,
      服务: {
        获得服务地址: (): string => 前端地址,
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

  public async 执行<结果>(
    调用: (工具: 需求测试工具) => Promise<结果>,
  ): Promise<{ 结果: 调用结果<结果>; 附件们: readonly 调用附件[]; 取证错误们: readonly string[] }> {
    this.检查开放()
    this.调用序号 += 1
    let 序号 = this.调用序号
    let 证据们: 流程步骤附件[] = []
    let 取证错误们: string[] = []
    let 记录错误 = (错误: unknown): void => {
      取证错误们.push(错误文本(错误))
    }
    this.执行中 += 1
    try {
      let 结果: 调用结果<结果>
      try {
        let 值 = await this.运行工具.执行步骤(
          (附件们): void => {
            for (let 附件 of 附件们) 证据们.push(附件)
          },
          记录错误,
          () => 调用(this.运行工具.工具),
        )
        结果 = { 成功: true, 值 }
      } catch (错误) {
        结果 = { 成功: false, 错误: 错误文本(错误) }
      }
      let 附件们 = await this.保存证据(序号, 证据们, 记录错误)
      return { 结果, 附件们, 取证错误们 }
    } finally {
      this.执行中 -= 1
    }
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
