import fs from 'node:fs'
import path from 'node:path'

import type { Appium配置 } from './appium-dir'
import { 创建Appium常驻管理器 } from './resident'

/** 常驻 Appium 服务上的一个 W3C WebDriver 会话，用原生 fetch 调用，不引入 webdriverio。服务本身常驻（resident.ts），关闭会话不停服务。 */
export class Appium会话 {
  public static async 启动(取消信号: AbortSignal, 配置: Appium配置): Promise<Appium会话> {
    let 管理器 = 创建Appium常驻管理器(配置)
    return new Appium会话(await 管理器.确保Appium常驻(取消信号), 取消信号, 管理器.获得常驻目录())
  }
  private 会话号: string | undefined
  private 已关闭 = false

  private constructor(
    private readonly 地址: string,
    private readonly 取消信号: AbortSignal,
    private readonly 日志目录: string,
  ) {}

  public async 创建会话(能力: Record<string, unknown>, 超时毫秒: number): Promise<void> {
    let 结果 = await this.请求<{ sessionId: string }>(
      'POST',
      '/session',
      { capabilities: { alwaysMatch: 能力 } },
      超时毫秒,
    )
    this.会话号 = 结果.sessionId
  }

  /** 常驻 Appium 的日志文件尾部（服务里有多个会话时包含其他会话的内容）。 */
  public 获得日志(): string {
    try {
      return fs.readFileSync(path.join(this.日志目录, 'appium.log'), 'utf8').slice(-20_000)
    } catch {
      return ''
    }
  }

  public async 请求<T>(方法: 'GET' | 'POST' | 'DELETE', 路径: string, 内容?: unknown, 超时毫秒 = 60_000): Promise<T> {
    let 完整路径 = 路径 === '/session' || this.会话号 === undefined ? 路径 : `/session/${this.会话号}${路径}`
    let 响应 = await fetch(`${this.地址}${完整路径}`, {
      method: 方法,
      headers: { 'content-type': 'application/json' },
      ...(内容 === undefined ? {} : { body: JSON.stringify(内容) }),
      signal: AbortSignal.any([this.取消信号, AbortSignal.timeout(超时毫秒)]),
    })
    let 正文 = (await 响应.json()) as { value: unknown }
    if (响应.ok === false) {
      let 值 = 正文.value as { error?: string; message?: string }
      throw new Error(`Appium ${方法} ${完整路径} 失败：${值.error ?? String(响应.status)} ${值.message ?? ''}`)
    }
    return 正文.value as T
  }

  public async 执行脚本<T>(脚本: string, 参数: readonly unknown[] = []): Promise<T> {
    return await this.请求<T>('POST', '/execute/sync', { script: 脚本, args: 参数 })
  }

  public async 关闭(): Promise<void> {
    if (this.已关闭) return
    this.已关闭 = true
    try {
      if (this.会话号 !== undefined)
        await fetch(`${this.地址}/session/${this.会话号}`, { method: 'DELETE', signal: AbortSignal.timeout(15_000) })
    } catch {
      // 会话删除失败时放弃，常驻服务下次创建会话不受影响。
    }
  }
}
