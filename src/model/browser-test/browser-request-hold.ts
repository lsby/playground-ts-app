import type { APIResponse, Page, Request } from '@playwright/test'
import { createHash } from 'node:crypto'
import { z } from 'zod'

export type 浏览器请求挂起规则 = { 标识: string; 路径: string; 请求正文匹配: Record<string, string>; 后端地址: string }
export type 浏览器请求等待阶段 = 'captured' | 'response-ready' | 'finished'
type 请求阶段 = 'armed' | 浏览器请求等待阶段 | 'released' | 'failed' | 'cancelled'
export type 浏览器请求状态 = {
  requestId: string
  phase: 请求阶段
  captured: number
  finished: number
  status?: number
  bodySha256?: string
  error?: string
}
type 等待者 = { 检查: () => void }
type 挂起记录 = {
  规则: 浏览器请求挂起规则
  状态: 浏览器请求状态
  请求: Request | null
  放行: Promise<void>
  释放: () => void
  等待者们: Set<等待者>
}
let 阶段顺序: Record<请求阶段, number> = {
  armed: 0,
  captured: 1,
  'response-ready': 2,
  released: 3,
  finished: 4,
  failed: -1,
  cancelled: -1,
}

/** 只延迟真实同源响应的交付，不修改请求、响应或后端执行结果。 */
export class 浏览器请求挂起 {
  private 记录表 = new Map<string, 挂起记录>()
  private 已停止 = false
  private 路由清理 = new Set<() => Promise<void>>()

  private 关闭 = (): void => {
    this.停止('浏览器已关闭')
  }
  private 中止 = (): void => {
    this.停止('测试会话已取消')
  }
  private 请求结束 = (请求: Request): void => {
    for (let 记录 of this.记录表.values()) {
      if (记录.请求 !== 请求 || 记录.状态.phase === 'failed' || 记录.状态.phase === 'cancelled') continue
      记录.状态.finished = 1
      this.更新(记录, 'finished')
    }
  }
  private 请求失败 = (请求: Request): void => {
    for (let 记录 of this.记录表.values()) {
      if (记录.请求 !== 请求) continue
      this.失败(记录, 请求.failure()?.errorText ?? '浏览器请求失败')
    }
  }

  public constructor(
    private 页面: Page,
    private 信号?: AbortSignal,
  ) {
    页面.on('close', this.关闭)
    页面.on('requestfinished', this.请求结束)
    页面.on('requestfailed', this.请求失败)
    信号?.addEventListener('abort', this.中止, { once: true })
  }

  public async 安装(规则: 浏览器请求挂起规则): Promise<浏览器请求状态> {
    if (this.已停止 || this.页面.isClosed()) throw new Error('浏览器请求控制已关闭')
    this.信号?.throwIfAborted()
    if (this.记录表.has(规则.标识)) throw new Error(`请求规则已存在：${规则.标识}`)
    let 当前地址 = new URL(规则.后端地址)
    if (
      (当前地址.protocol !== 'http:' && 当前地址.protocol !== 'https:') ||
      (当前地址.hostname !== '127.0.0.1' && 当前地址.hostname !== 'localhost')
    )
      throw new Error('请求挂起仅允许本机测试后端地址')
    if (
      规则.路径.startsWith('/') === false ||
      new URL(规则.路径, 当前地址).origin !== 当前地址.origin ||
      new URL(规则.路径, 当前地址).pathname !== 规则.路径
    )
      throw new Error('请求路径必须是无查询参数的同源绝对路径')
    let 释放 = (): void => {}
    let 放行 = new Promise<void>((完成): void => {
      释放 = 完成
    })
    let 记录: 挂起记录 = {
      规则,
      状态: { requestId: 规则.标识, phase: 'armed', captured: 0, finished: 0 },
      请求: null,
      放行,
      释放,
      等待者们: new Set(),
    }
    this.记录表.set(规则.标识, 记录)
    let 匹配地址 = (地址: URL): boolean => 地址.origin === 当前地址.origin && 地址.pathname === 规则.路径
    let 处理: Parameters<Page['route']>[1] = async (路由): Promise<void> => {
      if (记录.状态.phase !== 'armed' || this.匹配(路由.request(), 规则) === false) {
        await 路由.fallback()
        return
      }
      记录.请求 = 路由.request()
      记录.状态.captured = 1
      this.更新(记录, 'captured')
      let 响应: APIResponse | undefined
      try {
        let 上游 = 路由.fetch({ maxRetries: 0, maxRedirects: 0, timeout: 10_000 })
        void 上游.then(
          async (结果): Promise<void> => {
            if (this.已终止(记录)) await this.释放响应(记录, 结果)
          },
          (): void => {},
        )
        响应 = await Promise.race([上游, 记录.放行.then((): undefined => undefined)])
        if (响应 === undefined) {
          await 路由.abort('aborted').catch((): void => {})
          return
        }
        let 正文 = await 响应.body()
        if (this.已终止(记录)) {
          await 路由.abort('aborted').catch((): void => {})
          return
        }
        记录.状态.status = 响应.status()
        记录.状态.bodySha256 = createHash('sha256').update(正文).digest('hex')
        this.更新(记录, 'response-ready')
        await 记录.放行
        if (this.已终止(记录)) {
          await 路由.abort('aborted').catch((): void => {})
          return
        }
        this.更新(记录, 'released')
        await 路由.fulfill({ response: 响应 })
      } catch (错误) {
        if (this.已终止(记录)) return
        this.失败(记录, `真实后端请求转发或交付失败：${错误 instanceof Error ? 错误.name : 'UnknownError'}`)
        await 路由.abort('failed').catch((): void => {})
      } finally {
        if (响应 !== undefined) await this.释放响应(记录, 响应)
      }
    }
    await this.页面.route(匹配地址, 处理)
    this.路由清理.add(async (): Promise<void> => this.页面.unroute(匹配地址, 处理))
    return { ...记录.状态 }
  }

  private 匹配(请求: Request, 规则: 浏览器请求挂起规则): boolean {
    if (请求.method() !== 'POST') return false
    let 内容 = 请求.postData()
    if (内容 === null) return false
    let 解析: z.SafeParseReturnType<unknown, Record<string, unknown>>
    try {
      解析 = z.record(z.unknown()).safeParse(JSON.parse(内容))
    } catch {
      return false
    }
    if (解析.success === false) return false
    let 数据 = 解析.data
    return Object.entries(规则.请求正文匹配).every(([键, 值]): boolean => 数据[键] === 值)
  }

  private 已终止(记录: 挂起记录): boolean {
    return 记录.状态.phase === 'failed' || 记录.状态.phase === 'cancelled'
  }

  private async 释放响应(记录: 挂起记录, 响应: APIResponse): Promise<void> {
    try {
      await 响应.dispose()
    } catch {
      if (this.已停止 === false && this.页面.isClosed() === false) this.失败(记录, '释放真实后端响应失败')
    }
  }

  private 更新(记录: 挂起记录, 阶段: 请求阶段): void {
    记录.状态.phase = 阶段
    for (let 等待 of 记录.等待者们) 等待.检查()
  }

  private 失败(记录: 挂起记录, 原因: string): void {
    if (this.已终止(记录)) return
    记录.状态.error = 原因
    this.更新(记录, 'failed')
    记录.释放()
  }

  private 获得(标识: string): 挂起记录 {
    let 记录 = this.记录表.get(标识)
    if (记录 === undefined) throw new Error(`请求规则不存在：${标识}`)
    return 记录
  }

  public async 等待(标识: string, 阶段: 浏览器请求等待阶段, 超时: number): Promise<浏览器请求状态> {
    let 记录 = this.获得(标识)
    return await new Promise<浏览器请求状态>((完成, 拒绝): void => {
      let 计时器: ReturnType<typeof setTimeout>
      let 等待者: 等待者 = {
        检查: (): void => {
          if (this.已终止(记录)) {
            结束()
            拒绝(new Error(`请求 ${标识} ${记录.状态.phase}：${记录.状态.error ?? ''}`))
          } else if (阶段顺序[记录.状态.phase] >= 阶段顺序[阶段]) {
            结束()
            完成({ ...记录.状态 })
          }
        },
      }
      let 结束 = (): void => {
        clearTimeout(计时器)
        记录.等待者们.delete(等待者)
      }
      计时器 = setTimeout((): void => {
        结束()
        let 原因 = `请求 ${标识} 等待 ${阶段} 超时，当前为 ${记录.状态.phase}`
        this.失败(记录, 原因)
        拒绝(new Error(原因))
      }, 超时)
      记录.等待者们.add(等待者)
      等待者.检查()
    })
  }

  public async 放行(标识: string, 超时: number): Promise<浏览器请求状态> {
    let 记录 = this.获得(标识)
    if (记录.状态.phase !== 'response-ready') throw new Error(`请求 ${标识} 尚未取得可释放响应：${记录.状态.phase}`)
    记录.释放()
    return await this.等待(标识, 'finished', 超时)
  }

  private 停止(原因: string): void {
    if (this.已停止) return
    this.已停止 = true
    for (let 记录 of this.记录表.values()) {
      if (记录.状态.phase === 'finished' || this.已终止(记录)) continue
      记录.状态.error = 原因
      this.更新(记录, 'cancelled')
      记录.释放()
    }
    this.信号?.removeEventListener('abort', this.中止)
    this.页面.off('close', this.关闭)
    this.页面.off('requestfinished', this.请求结束)
    this.页面.off('requestfailed', this.请求失败)
    if (this.页面.isClosed() === false) void Promise.allSettled([...this.路由清理].map((清理) => 清理()))
    this.路由清理.clear()
  }
}
