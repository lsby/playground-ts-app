type 外部关闭策略 = '不关闭' | '仅遮罩' | '任意外部'

export type 浮层选项 = {
  根元素: HTMLElement
  内容元素: HTMLElement
  模态?: boolean
  允许Escape关闭?: boolean
  外部关闭?: 外部关闭策略
  初始焦点?: HTMLElement
  请求关闭?: () => void | Promise<void>
}

export type 浮层句柄 = { id: number; 关闭: () => Promise<void> }

type 浮层记录 = 浮层选项 & { id: number; 原焦点: HTMLElement | null; 正在关闭: boolean }

type 页面滚动状态 = { overflow: string; paddingRight: string }

class 浮层管理器类 {
  private 栈: 浮层记录[] = []
  private 序号 = 0
  private 全局监听器 = new AbortController()
  private 原页面滚动状态: 页面滚动状态 | null = null
  private 原惰性状态 = new Map<HTMLElement, boolean>()

  public constructor() {
    this.绑定全局事件()
  }

  public 打开(选项: 浮层选项): 浮层句柄 {
    this.序号 += 1
    let 记录: 浮层记录 = { ...选项, id: this.序号, 原焦点: this.获得当前焦点(), 正在关闭: false }
    记录.根元素.style.zIndex = `calc(var(--浮层起始层级) + ${String(this.栈.length * 2)})`
    记录.根元素.dataset['overlayId'] = String(记录.id)
    this.栈.push(记录)
    document.body.appendChild(记录.根元素)
    this.同步页面滚动()
    this.同步背景可交互性()
    this.安排初始聚焦(记录)

    return { id: 记录.id, 关闭: async (): Promise<void> => await this.关闭(记录.id) }
  }

  public async 关闭(id?: number): Promise<void> {
    let 记录 = id === undefined ? this.栈[this.栈.length - 1] : this.栈.find((项) => 项.id === id)
    if (记录 === undefined || 记录.正在关闭 === true) return
    let 是顶层 = this.栈[this.栈.length - 1]?.id === 记录.id
    记录.正在关闭 = true
    let 索引 = this.栈.findIndex((项) => 项.id === 记录.id)
    if (索引 >= 0) this.栈.splice(索引, 1)
    记录.根元素.remove()
    this.同步页面滚动()
    this.同步背景可交互性()
    if (是顶层 === true && 记录.原焦点?.isConnected === true) 记录.原焦点.focus()
  }

  public async 请求关闭(id: number): Promise<void> {
    let 记录 = this.栈.find((项) => 项.id === id)
    if (记录 === undefined || 记录.正在关闭 === true) return
    if (记录.请求关闭 !== undefined) await 记录.请求关闭()
    else await this.关闭(id)
  }

  public 获得顶层(): Readonly<浮层记录> | undefined {
    return this.栈[this.栈.length - 1]
  }

  public 是否有浮层(): boolean {
    return this.栈.length > 0
  }

  private 绑定全局事件(): void {
    document.addEventListener(
      'keydown',
      (event: KeyboardEvent): void => {
        let 顶层 = this.获得顶层()
        if (顶层 === undefined) return
        if (event.key === 'Escape' && 顶层.允许Escape关闭 !== false) {
          event.preventDefault()
          event.stopPropagation()
          void this.请求关闭(顶层.id).catch((错误: unknown): void => console.error('关闭浮层失败:', 错误))
          return
        }
        if (event.key === 'Tab' && 顶层.模态 === true) this.约束焦点(event, 顶层.内容元素)
      },
      { capture: true, signal: this.全局监听器.signal },
    )
    document.addEventListener(
      'pointerdown',
      (event: PointerEvent): void => {
        let 顶层 = this.获得顶层()
        if (顶层 === undefined || event.target instanceof Node === false) return
        let 策略 = 顶层.外部关闭 ?? '不关闭'
        let 是内部 = 顶层.内容元素.contains(event.target)
        let 是遮罩 = event.target === 顶层.根元素
        if ((策略 === '任意外部' && 是内部 === false) || (策略 === '仅遮罩' && 是遮罩 === true)) {
          void this.请求关闭(顶层.id).catch((错误: unknown): void => console.error('关闭浮层失败:', 错误))
        }
      },
      { capture: true, signal: this.全局监听器.signal },
    )
  }

  private 安排初始聚焦(记录: 浮层记录, 尝试次数 = 0): void {
    requestAnimationFrame((): void => {
      let 仍然打开 = 记录.根元素.isConnected === true && this.栈.some((项) => 项.id === 记录.id)
      if (仍然打开 === false) return
      let 指定焦点内部 = 记录.初始焦点 === undefined ? undefined : this.获得可聚焦元素(记录.初始焦点)[0]
      let 指定焦点本身 =
        记录.初始焦点?.matches('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])') === true
          ? 记录.初始焦点
          : undefined
      let 初始焦点 = 指定焦点内部 ?? 指定焦点本身 ?? this.获得可聚焦元素(记录.内容元素)[0]
      if (初始焦点 === undefined && 尝试次数 < 5) {
        this.安排初始聚焦(记录, 尝试次数 + 1)
        return
      }
      初始焦点 ??= 记录.内容元素
      初始焦点.focus()
    })
  }

  private 约束焦点(event: KeyboardEvent, 容器: HTMLElement): void {
    let 可聚焦元素们 = this.获得可聚焦元素(容器)
    if (可聚焦元素们.length === 0) {
      event.preventDefault()
      容器.focus()
      return
    }
    let 首个 = 可聚焦元素们[0]
    let 最后 = 可聚焦元素们[可聚焦元素们.length - 1]
    if (首个 === undefined || 最后 === undefined) return
    if (event.shiftKey === true && this.元素拥有焦点(首个)) {
      event.preventDefault()
      最后.focus()
    } else if (event.shiftKey === false && this.元素拥有焦点(最后)) {
      event.preventDefault()
      首个.focus()
    }
  }

  private 获得可聚焦元素(根: ParentNode): HTMLElement[] {
    let 结果: HTMLElement[] = []
    let 遍历 = (节点: ParentNode): void => {
      for (let 子节点 of 节点.children) {
        if (子节点 instanceof HTMLElement) {
          let 计算样式 = getComputedStyle(子节点)
          let 可见 =
            子节点.hidden === false &&
            子节点.getAttribute('aria-hidden') !== 'true' &&
            计算样式.display !== 'none' &&
            计算样式.visibility !== 'hidden' &&
            子节点.getClientRects().length > 0
          let 可用 = 'disabled' in 子节点 === false || 子节点.getAttribute('disabled') === null
          if (
            可见 === true &&
            可用 === true &&
            子节点.matches('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')
          ) {
            结果.push(子节点)
          }
          if (子节点.shadowRoot !== null) 遍历(子节点.shadowRoot)
          遍历(子节点)
        }
      }
    }
    遍历(根)
    return 结果
  }

  private 元素拥有焦点(元素: HTMLElement): boolean {
    return this.获得当前焦点() === 元素
  }

  private 获得当前焦点(): HTMLElement | null {
    let 当前: Element | null = document.activeElement
    while (
      当前 instanceof HTMLElement &&
      当前.shadowRoot?.activeElement !== null &&
      当前.shadowRoot?.activeElement !== undefined
    ) {
      当前 = 当前.shadowRoot.activeElement
    }
    return 当前 instanceof HTMLElement ? 当前 : null
  }

  private 同步页面滚动(): void {
    let 需要锁定 = this.栈.some((项) => 项.模态 === true)
    if (需要锁定 === true && this.原页面滚动状态 === null) {
      let 滚动条宽度 = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
      let 原右内边距 = Number.parseFloat(getComputedStyle(document.body).paddingRight)
      this.原页面滚动状态 = { overflow: document.body.style.overflow, paddingRight: document.body.style.paddingRight }
      if (滚动条宽度 > 0) {
        let 右内边距 = Number.isFinite(原右内边距) ? 原右内边距 : 0
        document.body.style.paddingRight = `${右内边距 + 滚动条宽度}px`
      }
      document.body.style.overflow = 'hidden'
    }
    if (需要锁定 === false && this.原页面滚动状态 !== null) {
      document.body.style.overflow = this.原页面滚动状态.overflow
      document.body.style.paddingRight = this.原页面滚动状态.paddingRight
      this.原页面滚动状态 = null
    }
  }

  private 同步背景可交互性(): void {
    let 顶层模态索引 = this.栈.findLastIndex((项): boolean => 项.模态 === true)
    if (顶层模态索引 < 0) {
      for (let [元素, 原状态] of this.原惰性状态) {
        if (元素.isConnected === true) 元素.inert = 原状态
      }
      this.原惰性状态.clear()
      return
    }
    let 可交互根元素 = new Set(this.栈.slice(顶层模态索引).map((项) => 项.根元素))
    for (let 子元素 of document.body.children) {
      if (子元素 instanceof HTMLElement === false) continue
      if (this.原惰性状态.has(子元素) === false) this.原惰性状态.set(子元素, 子元素.inert)
      子元素.inert = 可交互根元素.has(子元素) === false
    }
  }
}

export let 浮层管理器 = new 浮层管理器类()
