import { globalWebLog } from '../global/manager/log-manager'
import { 获得滚动条样式 } from '../global/style/scrollbar'
import { 是中止错误, 等待可取消任务 } from '../global/tools/abort'

type 清理函数 = () => void | Promise<void>

export function 要求组件构造参数<参数类型>(参数: 参数类型 | undefined, 组件名称: string): 参数类型 {
  if (参数 === undefined) throw new Error(`${组件名称}只能通过 new 并传入配置参数创建`)
  return 参数
}

export abstract class 组件基类<
  发出事件类型 extends Record<string, unknown>,
  监听事件类型 extends Record<string, unknown>,
> extends HTMLElement {
  public static 注册组件(组件名称: string, 组件: CustomElementConstructor): void {
    if (customElements.get(组件名称) === undefined) customElements.define(组件名称, 组件)
    else console.warn(`组件名称 ${组件名称} 重复`)
  }

  protected log = globalWebLog.extend(this.constructor.name)
  private 基础样式元素 = document.createElement('style')
  private 初始化完毕 = false
  private 初始化完成事件: Promise<void> | null = null
  private 初始化完成解析器: (() => void) | null = null
  private 渲染监听器列表: Array<{ type: string; handler: EventListener; options?: AddEventListenerOptions }> = []
  private 清理函数列表: 清理函数[] = []
  private 渲染队列: Promise<void> = Promise.resolve()
  private 渲染代次 = 0
  private 渲染控制器 = new AbortController()
  private 正在执行加载生命周期 = false
  private _shadow = this.attachShadow({ mode: 'open' })

  public constructor() {
    super()
    this.基础样式元素.dataset['componentBaseStyle'] = 'true'
    this.基础样式元素.textContent = `${获得滚动条样式(':host')}${获得滚动条样式('*')}
:host(:focus-visible), :focus-visible {
  outline: 2px solid var(--主色调) !important;
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}`
    this._shadow.appendChild(this.基础样式元素)
  }

  protected get shadow(): ShadowRoot {
    return this._shadow
  }

  protected get 渲染信号(): AbortSignal {
    return this.渲染控制器.signal
  }

  protected 等待渲染任务<结果类型>(任务: Promise<结果类型>): Promise<结果类型> {
    return 等待可取消任务(任务, this.渲染信号)
  }

  public 获得宿主样式(): CSSStyleDeclaration {
    let host = this._shadow.host
    if (host instanceof HTMLElement) return host.style
    throw new Error('Shadow host is not HTMLElement')
  }

  public 清空dom(): void {
    this.replaceChildren()
  }

  public 清空影子dom(): void {
    for (let 节点 of [...this._shadow.childNodes]) {
      if (节点 !== this.基础样式元素) 节点.remove()
    }
    if (this.基础样式元素.parentNode !== this._shadow) this._shadow.prepend(this.基础样式元素)
  }

  public 刷新(): Promise<void> {
    return this.请求渲染()
  }

  /** 只有组件挂载并完成当前轮渲染后，该 Promise 才会完成。 */
  public 等待初始化(): Promise<void> {
    if (this.初始化完毕 === true) return Promise.resolve()
    if (this.初始化完成事件 === null) {
      this.初始化完成事件 = new Promise<void>((resolve) => {
        this.初始化完成解析器 = resolve
      })
    }
    return this.初始化完成事件
  }

  public 派发事件<K extends keyof 发出事件类型>(
    k: K,
    v: 发出事件类型[K],
    o?: Omit<CustomEventInit<发出事件类型[K]>, 'detail'>,
  ): boolean {
    void this.log.debug('派发事件: %o, 数据: %O', k, v)
    return this.dispatchEvent(
      new CustomEvent(k.toString(), { detail: v, bubbles: true, cancelable: true, composed: true, ...o }),
    )
  }

  public 监听冒泡事件<K extends keyof 监听事件类型>(
    k: K,
    f: (e: CustomEvent<监听事件类型[K]>) => void | Promise<void>,
    o?: AddEventListenerOptions,
  ): void {
    this.注册事件监听(k.toString(), f as (e: CustomEvent<unknown>) => void | Promise<void>, o)
  }

  public 监听发出事件<K extends keyof 发出事件类型>(
    k: K,
    f: (e: CustomEvent<发出事件类型[K]>) => void | Promise<void>,
    o?: AddEventListenerOptions,
  ): void {
    this.注册事件监听(k.toString(), f as (e: CustomEvent<unknown>) => void | Promise<void>, o)
  }

  protected 注册清理(函数: 清理函数): void {
    this.清理函数列表.push(函数)
  }

  protected 注册观察器(观察器: ResizeObserver | MutationObserver | IntersectionObserver): void {
    this.注册清理((): void => {
      观察器.disconnect()
    })
  }

  protected 安全执行(函数: () => void | Promise<void>): void {
    try {
      let 结果 = 函数()
      if (结果 instanceof Promise) {
        void 结果.catch((错误: unknown): void => {
          this.报告错误(错误)
        })
      }
    } catch (错误) {
      this.报告错误(错误)
    }
  }

  protected abstract 当加载时(): void | Promise<void>
  protected 当卸载时?(): void | Promise<void>
  protected 当转移时?(): void | Promise<void>

  private connectedCallback(): void {
    void this.log.debug('connectedCallback, 对象: %O', this)
    void this.请求渲染().catch((错误: unknown): void => {
      if (是中止错误(错误) === false) this.报告错误(错误)
    })
  }

  private disconnectedCallback(): void {
    void this.log.debug('disconnectedCallback, 对象: %O', this)
    this.渲染代次 += 1
    this.渲染控制器.abort()
    this.重置初始化事件()
    let 任务 = this.渲染队列
      .catch((): void => {})
      .then(async (): Promise<void> => {
        await this.执行清理()
        await this.当卸载时?.()
      })
      .catch((错误: unknown): void => {
        this.报告错误(错误)
      })
    this.渲染队列 = 任务
  }

  private adoptedCallback(): void {
    if (this.当转移时 === undefined) return
    this.安全执行(async (): Promise<void> => await this.当转移时?.())
  }

  private 请求渲染(): Promise<void> {
    this.重置初始化事件()
    this.渲染代次 += 1
    let 本次代次 = this.渲染代次
    this.渲染控制器.abort()
    this.渲染控制器 = new AbortController()
    let 任务 = this.渲染队列
      .catch((): void => {})
      .then(async (): Promise<void> => {
        if (this.isConnected === false || 本次代次 !== this.渲染代次) return
        await this.执行清理()
        this.清空影子dom()
        this.正在执行加载生命周期 = true
        try {
          await this.当加载时()
        } finally {
          this.正在执行加载生命周期 = false
        }
        if (本次代次 !== this.渲染代次) return
        this.初始化完毕 = true
        this.初始化完成解析器?.()
        this.初始化完成解析器 = null
      })
      .catch((错误: unknown): void => {
        if (是中止错误(错误) === false) throw 错误
      })
    this.渲染队列 = 任务
    return 任务
  }

  private 注册事件监听(
    类型: string,
    函数: (e: CustomEvent<unknown>) => void | Promise<void>,
    选项?: AddEventListenerOptions,
  ): void {
    let 处理器 = (event: Event): void => {
      if (event instanceof CustomEvent === false) return
      this.安全执行(async (): Promise<void> => await 函数(event))
    }
    let 最终选项: AddEventListenerOptions = { capture: false, once: false, passive: false, ...选项 }
    this.addEventListener(类型, 处理器, 最终选项)
    if (this.正在执行加载生命周期 === true) this.渲染监听器列表.push({ type: 类型, handler: 处理器, options: 最终选项 })
  }

  private async 执行清理(): Promise<void> {
    for (let 监听器 of this.渲染监听器列表) {
      this.removeEventListener(监听器.type, 监听器.handler, 监听器.options)
    }
    this.渲染监听器列表 = []
    let 待清理列表 = this.清理函数列表
    this.清理函数列表 = []
    for (let 清理 of 待清理列表.reverse()) await 清理()
  }

  private 重置初始化事件(): void {
    this.初始化完毕 = false
    if (this.初始化完成解析器 !== null) return
    this.初始化完成事件 = new Promise<void>((resolve) => {
      this.初始化完成解析器 = resolve
    })
  }

  private 报告错误(错误: unknown): void {
    void this.log.error('组件执行失败: %O', 错误)
    let 标准错误 = 错误 instanceof Error ? 错误 : new Error(String(错误))
    this.dispatchEvent(new ErrorEvent('error', { error: 标准错误, message: 标准错误.message }))
  }
}
