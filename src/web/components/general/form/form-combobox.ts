import { 浮层管理器, type 浮层句柄 } from '../../../global/manager/overlay-manager'
import { 是中止错误 } from '../../../global/tools/abort'
import { 创建元素, 应用宿主样式, 应用样式 } from '../../../global/tools/create-element'
import { 增强样式类型 } from '../../../global/types/style'
import { 获得表单控件基础样式 } from './control-style'
import { 表单组件基类 } from './form'
import { 同步表单控件校验状态 } from './form-accessibility'

export type 组合框选项 = { 值: string; 文本: string; 禁用?: boolean }
export type 组合框加载命令 = (查询: string, 上下文: { 信号: AbortSignal }) => Promise<readonly 组合框选项[]>
export type 组合框配置 = {
  选项列表?: readonly 组合框选项[]
  加载选项命令?: 组合框加载命令
  查询防抖毫秒?: number
  值?: string
  占位符?: string
  空状态文本?: string
  禁用?: boolean
  可访问名称?: string
  宿主样式?: 增强样式类型
  元素样式?: 增强样式类型
}

type 组合框事件 = { 搜索: string; 变化: string; 焦点: void; 失焦: void; 加载失败: unknown }
let 组合框序号 = 0

export class 组合框 extends 表单组件基类<组合框事件, {}, string> {
  static {
    this.注册组件('lsby-form-combobox', this)
  }

  private 配置: 组合框配置
  private 全部选项: 组合框选项[]
  private 当前选项: 组合框选项[] = []
  private 输入元素?: HTMLInputElement
  private 面板元素?: HTMLDivElement
  private 选项元素列表: HTMLDivElement[] = []
  private 活动索引 = -1
  private 浮层句柄: 浮层句柄 | null = null
  private 查询控制器 = new AbortController()
  private 面板标识: string

  public constructor(配置: 组合框配置 = {}) {
    super()
    组合框序号 += 1
    this.面板标识 = `lsby-combobox-list-${组合框序号}`
    this.配置 = 配置
    this.全部选项 = [...(配置.选项列表 ?? [])]
  }

  protected override 当加载时(): void {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)
    let 输入 = 创建元素('input', {
      type: 'text',
      placeholder: this.配置.占位符 ?? '请输入关键字',
      disabled: this.配置.禁用 ?? false,
      autocomplete: 'off',
      style: { ...this.获得输入样式(), ...this.配置.元素样式 },
    })
    输入.setAttribute('role', 'combobox')
    输入.setAttribute('aria-autocomplete', 'list')
    输入.setAttribute('aria-expanded', 'false')
    输入.setAttribute('aria-controls', this.面板标识)
    if (this.配置.可访问名称 !== undefined) 输入.setAttribute('aria-label', this.配置.可访问名称)

    let 面板 = 创建元素('div', {
      id: this.面板标识,
      role: 'listbox',
      style: {
        position: 'fixed',
        inset: 'unset',
        margin: '0',
        padding: 'var(--间距-1) 0',
        maxHeight: '240px',
        overflowY: 'auto',
        border: '1px solid var(--边框颜色)',
        borderRadius: 'var(--圆角-中)',
        backgroundColor: 'var(--卡片背景颜色)',
        color: 'var(--文字颜色)',
        boxShadow: 'var(--浅阴影)',
        boxSizing: 'border-box',
      },
    })
    面板.setAttribute('popover', 'manual')
    面板.setAttribute('aria-label', `${this.配置.可访问名称 ?? '可搜索选择'}选项`)
    let 容器 = 创建元素('div', { style: { position: 'relative' } })
    容器.append(输入, 面板)
    this.输入元素 = 输入
    this.面板元素 = 面板
    this.shadow.append(容器)
    this.同步显示文本()
    this.应用本地筛选('')
    this.绑定事件(输入)
    this.注册清理(async (): Promise<void> => {
      this.查询控制器.abort()
      await this.关闭面板()
    })
  }

  public 获得值(): string {
    return this.配置.值 ?? ''
  }

  public 设置值(值: string): void {
    this.配置.值 = 值
    this.同步显示文本()
  }

  public 设置选项列表(选项列表: readonly 组合框选项[]): void {
    this.配置.选项列表 = 选项列表
    this.全部选项 = [...选项列表]
    this.应用本地筛选(this.输入元素?.value ?? '')
    this.同步显示文本()
  }

  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    if (this.输入元素 !== undefined) {
      this.输入元素.disabled = 值
      应用样式(this.输入元素, { ...this.获得输入样式(), ...this.配置.元素样式 })
    }
    if (值 === true) this.安全执行(async (): Promise<void> => await this.关闭面板())
  }

  public 获得禁用(): boolean {
    return this.配置.禁用 ?? false
  }

  public 聚焦(): void {
    this.输入元素?.focus()
  }

  public 设置可访问名称(名称: string): void {
    this.配置.可访问名称 = 名称
    this.输入元素?.setAttribute('aria-label', 名称)
    this.面板元素?.setAttribute('aria-label', `${名称}选项`)
  }

  public 设置校验状态(错误: string | null, 描述文本列表: string[]): void {
    if (this.输入元素 !== undefined) 同步表单控件校验状态([this.输入元素], 错误, 描述文本列表)
  }

  private 绑定事件(输入: HTMLInputElement): void {
    输入.onfocus = (): void => {
      this.派发事件('焦点', undefined)
      this.安全执行(async (): Promise<void> => await this.执行查询(输入.value, false))
    }
    输入.oninput = (): void => {
      this.派发事件('搜索', 输入.value)
      this.安全执行(async (): Promise<void> => await this.执行查询(输入.value, true))
    }
    输入.onblur = (): void => {
      window.setTimeout((): void => {
        if (this.输入元素?.matches(':focus') === true) return
        this.同步显示文本()
        this.派发事件('失焦', undefined)
      })
    }
    输入.onkeydown = (event: KeyboardEvent): void => this.处理键盘(event)
  }

  private async 执行查询(查询: string, 使用防抖: boolean): Promise<void> {
    this.查询控制器.abort()
    let 控制器 = new AbortController()
    this.查询控制器 = 控制器
    await this.打开面板()
    if (this.配置.加载选项命令 === undefined) {
      this.应用本地筛选(查询)
      return
    }
    this.渲染消息('正在加载选项', 'status')
    try {
      if (使用防抖 === true) await this.等待防抖(this.配置.查询防抖毫秒 ?? 200, 控制器.signal)
      let 选项列表 = await this.配置.加载选项命令(查询, { 信号: 控制器.signal })
      if (控制器.signal.aborted === true) return
      this.当前选项 = [...选项列表]
      this.渲染选项()
    } catch (错误) {
      if (是中止错误(错误, 控制器.signal) === true || 控制器.signal.aborted === true) return
      this.渲染消息('选项加载失败', 'alert')
      this.派发事件('加载失败', 错误)
    }
  }

  private 应用本地筛选(查询: string): void {
    let 标准查询 = 查询.trim().toLocaleLowerCase()
    this.当前选项 = this.全部选项.filter((选项): boolean => 选项.文本.toLocaleLowerCase().includes(标准查询))
    this.渲染选项()
  }

  private 渲染选项(): void {
    if (this.面板元素 === undefined) return
    this.面板元素.replaceChildren()
    this.选项元素列表 = []
    this.活动索引 = -1
    if (this.当前选项.length === 0) {
      this.渲染消息(this.配置.空状态文本 ?? '暂无匹配选项', 'status')
      return
    }
    this.当前选项.forEach((选项, 索引): void => {
      let 元素 = 创建元素('div', {
        id: `${this.面板标识}-option-${索引}`,
        role: 'option',
        textContent: 选项.文本,
        style: {
          padding: 'var(--间距-2) var(--间距-3)',
          cursor: 选项.禁用 === true ? 'not-allowed' : 'pointer',
          color: 选项.禁用 === true ? 'var(--次要文字颜色)' : 'var(--文字颜色)',
        },
      })
      元素.setAttribute('aria-selected', 选项.值 === this.获得值() ? 'true' : 'false')
      元素.setAttribute('aria-disabled', 选项.禁用 === true ? 'true' : 'false')
      元素.onpointerdown = (event: PointerEvent): void => event.preventDefault()
      元素.onclick = (): void => {
        if (选项.禁用 !== true) this.选择项(选项)
      }
      this.面板元素?.append(元素)
      this.选项元素列表.push(元素)
    })
    this.更新面板位置()
  }

  private 渲染消息(文本: string, 角色: 'status' | 'alert'): void {
    this.面板元素?.replaceChildren(
      创建元素('div', {
        role: 角色,
        textContent: 文本,
        style: { padding: 'var(--间距-3)', color: 'var(--次要文字颜色)' },
      }),
    )
    this.选项元素列表 = []
    this.活动索引 = -1
    this.更新面板位置()
  }

  private 处理键盘(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      this.安全执行(async (): Promise<void> => await this.关闭面板())
      this.同步显示文本()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (this.浮层句柄 === null) {
        this.安全执行(async (): Promise<void> => await this.执行查询(this.输入元素?.value ?? '', false))
        return
      }
      this.移动活动选项(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Enter' && this.活动索引 >= 0) {
      event.preventDefault()
      let 选项 = this.当前选项[this.活动索引]
      if (选项 !== undefined && 选项.禁用 !== true) this.选择项(选项)
    }
  }

  private 移动活动选项(方向: 1 | -1): void {
    if (this.当前选项.length === 0) return
    let 索引 = this.活动索引
    for (let 尝试 = 0; 尝试 < this.当前选项.length; 尝试 += 1) {
      索引 = (索引 + 方向 + this.当前选项.length) % this.当前选项.length
      if (this.当前选项[索引]?.禁用 !== true) break
    }
    this.活动索引 = 索引
    this.选项元素列表.forEach((元素, 当前索引): void => {
      元素.style.backgroundColor = 当前索引 === 索引 ? 'var(--选中背景颜色)' : 'transparent'
    })
    let 活动元素 = this.选项元素列表[索引]
    if (活动元素 !== undefined) {
      this.输入元素?.setAttribute('aria-activedescendant', 活动元素.id)
      活动元素.scrollIntoView({ block: 'nearest' })
    }
  }

  private 选择项(选项: 组合框选项): void {
    let 变化 = this.获得值() !== 选项.值
    this.配置.值 = 选项.值
    if (this.输入元素 !== undefined) this.输入元素.value = 选项.文本
    if (变化 === true) this.派发事件('变化', 选项.值)
    this.安全执行(async (): Promise<void> => await this.关闭面板())
  }

  private async 打开面板(): Promise<void> {
    if (this.面板元素 === undefined || this.输入元素 === undefined || this.浮层句柄 !== null) return
    this.浮层句柄 = 浮层管理器.打开({
      根元素: this.面板元素,
      内容元素: this.面板元素,
      挂载方式: '原位弹出层',
      附加内部元素: [this.输入元素],
      外部关闭: '任意外部',
      允许Escape关闭: true,
      位置更新: (): void => this.更新面板位置(),
      请求关闭: async (): Promise<void> => await this.关闭面板(),
    })
    this.输入元素.setAttribute('aria-expanded', 'true')
    this.更新面板位置()
  }

  private async 关闭面板(): Promise<void> {
    this.输入元素?.setAttribute('aria-expanded', 'false')
    this.输入元素?.removeAttribute('aria-activedescendant')
    let 句柄 = this.浮层句柄
    this.浮层句柄 = null
    await 句柄?.关闭()
  }

  private 更新面板位置(): void {
    if (this.面板元素 === undefined || this.输入元素 === undefined) return
    let 边距 = 8
    let 输入矩形 = this.输入元素.getBoundingClientRect()
    let 宽度 = Math.min(输入矩形.width, window.innerWidth - 边距 * 2)
    this.面板元素.style.width = `${宽度}px`
    this.面板元素.style.left = `${Math.max(边距, Math.min(输入矩形.left, window.innerWidth - 宽度 - 边距))}px`
    this.面板元素.style.top = `${Math.min(window.innerHeight - 边距, 输入矩形.bottom + 4)}px`
  }

  private 同步显示文本(): void {
    if (this.输入元素 === undefined) return
    let 选中项 = [...this.全部选项, ...this.当前选项].find((选项): boolean => 选项.值 === this.获得值())
    this.输入元素.value = 选中项?.文本 ?? ''
  }

  private 等待防抖(毫秒: number, 信号: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject): void => {
      let 计时器 = window.setTimeout((): void => {
        信号.removeEventListener('abort', 取消)
        resolve()
      }, 毫秒)
      let 取消 = (): void => {
        window.clearTimeout(计时器)
        reject(信号.reason ?? new DOMException('查询已取消', 'AbortError'))
      }
      if (信号.aborted === true) 取消()
      else 信号.addEventListener('abort', 取消, { once: true })
    })
  }

  private 获得输入样式(): 增强样式类型 {
    return 获得表单控件基础样式({ 禁用: this.配置.禁用 ?? false, 光标: 'text' })
  }
}
