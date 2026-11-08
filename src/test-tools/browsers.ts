import { join } from 'node:path'
import { z } from 'zod'

import { 浏览器测试引擎, type 浏览器测试模式 } from '../model/browser-test'
import { 浏览器步骤取证作用域 } from '../model/browser-test/step-evidence'
import type { 提交步骤附件, 需求测试附件 } from '../model/test-requirement'

type 会话 = Awaited<ReturnType<typeof 浏览器测试引擎.打开会话>>
type 会话记录 = { 打开任务: Promise<会话>; 会话?: 会话; 归档任务?: Promise<void> }

/** 每次流程尝试独立管理各个具名浏览器，关闭过的会话仍保留附件。 */
export class 需求测试浏览器组 {
  private 取证 = new 浏览器步骤取证作用域()
  private 会话们 = new Map<string, 会话记录>()
  private 附件们: 需求测试附件[] = []
  private 取证错误们: Error[] = []
  private 会话序号 = 0
  private 关闭任务: Promise<void> | undefined

  public constructor(
    private readonly 参数: {
      获得服务地址: () => string | undefined
      附件目录: string
      模式: 浏览器测试模式
      取消信号: AbortSignal
    },
  ) {}

  public async 打开(名称: string, 初始地址?: string): Promise<浏览器测试引擎> {
    z.string().trim().min(1).parse(名称)
    if (this.关闭任务 !== undefined) throw new Error('浏览器组已关闭')
    if (this.会话们.has(名称)) throw new Error(`浏览器会话已存在：${名称}`)
    let 服务地址 = this.参数.获得服务地址()
    this.会话序号 += 1
    let 打开任务 = 浏览器测试引擎.打开会话({
      ...(服务地址 === undefined ? {} : { 服务地址 }),
      附件目录: join(this.参数.附件目录, 'browsers', String(this.会话序号)),
      模式: this.参数.模式,
      取消信号: this.参数.取消信号,
      取证: { 作用域: this.取证, 会话名称: 名称 },
      ...(初始地址 === undefined ? {} : { 初始地址 }),
    })
    let 记录: 会话记录 = { 打开任务 }
    this.会话们.set(名称, 记录)
    try {
      记录.会话 = await 打开任务
      记录.会话.引擎.登记当前步骤()
      return 记录.会话.引擎
    } catch (错误) {
      this.会话们.delete(名称)
      throw 错误
    }
  }

  public 获得(名称: string): 浏览器测试引擎 {
    let 会话 = this.会话们.get(名称)?.会话
    if (会话 === undefined) throw new Error(`浏览器会话未打开：${名称}`)
    会话.引擎.登记当前步骤()
    return 会话.引擎
  }

  public 列出(): readonly string[] {
    return [...this.会话们].filter(([, 记录]) => 记录.会话 !== undefined).map(([名称]) => 名称)
  }

  public async 关闭(名称: string): Promise<void> {
    let 记录 = this.会话们.get(名称)
    if (记录 === undefined) throw new Error(`浏览器会话未打开：${名称}`)
    let 会话 = await 记录.打开任务
    try {
      await this.归档(名称, 记录)
    } finally {
      try {
        await 会话.关闭()
      } finally {
        if (this.会话们.get(名称) === 记录) this.会话们.delete(名称)
      }
    }
  }

  public async 执行步骤<T>(提交: 提交步骤附件, 记录错误: (错误: unknown) => void, 执行: () => Promise<T>): Promise<T> {
    return await this.取证.运行(
      (名称) => ({
        提交: async ({ 名称: 说明, 图片 }): Promise<void> => {
          提交([{ 类型: '图片', 内容类型: 'image/png', 内容: 图片.toString('base64'), 说明: `${名称} · ${说明}` }])
        },
        记录错误: (错误): void => 记录错误(new Error(`浏览器会话「${名称}」步骤取证失败`, { cause: 错误 })),
      }),
      执行,
    )
  }

  public async 收集附件(记录错误: (错误: unknown) => void): Promise<readonly 需求测试附件[]> {
    for (let [名称, 记录] of this.会话们) await this.归档(名称, 记录)
    for (let 错误 of this.取证错误们) 记录错误(错误)
    return [...this.附件们]
  }

  public 关闭全部(): Promise<void> {
    this.关闭任务 ??= this.结束会话们()
    return this.关闭任务
  }

  private 归档(名称: string, 记录: 会话记录): Promise<void> {
    记录.归档任务 ??= this.保存附件(名称, 记录)
    return 记录.归档任务
  }

  private async 保存附件(名称: string, 记录: 会话记录): Promise<void> {
    if (this.参数.取消信号.aborted) return
    try {
      let 会话 = await 记录.打开任务
      let 附件们 = await 会话.收集附件((错误): void => {
        this.取证错误们.push(new Error(`浏览器会话「${名称}」取证失败`, { cause: 错误 }))
      })
      this.附件们.push(...附件们.map((附件) => ({ ...附件, 名称: `${名称} · ${附件.名称}` })))
    } catch (错误) {
      this.取证错误们.push(new Error(`浏览器会话「${名称}」收集附件失败`, { cause: 错误 }))
    }
  }

  private async 结束会话们(): Promise<void> {
    let 记录们 = [...this.会话们.values()]
    this.会话们.clear()
    let 关闭结果们 = await Promise.allSettled(记录们.map(async (记录): Promise<void> => (await 记录.打开任务).关闭()))
    let 错误们 = 关闭结果们.filter((结果) => 结果.status === 'rejected').map((结果) => 结果.reason)
    if (错误们.length > 0) throw new AggregateError(错误们, '关闭测试浏览器失败')
  }
}
