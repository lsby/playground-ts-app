import { 增强样式类型 } from '../../../../web/global/types/style'
import { 组件基类 } from '../../../base/base'
import { 创建元素, 应用宿主样式, 应用样式 } from '../../../global/tools/create-element'

type 按钮事件 = { 点击: void }
type 监听按钮事件 = {}
type 按钮尺寸 = '紧凑' | '默认' | '宽松'

export type 按钮配置 = {
  id?: string
  文本?: string
  标题?: string
  禁用?: boolean
  加载中?: boolean
  自动加载?: boolean
  尺寸?: 按钮尺寸
  图标?: Node
  点击处理函数?: (e: MouseEvent) => void | Promise<void>
  宿主样式?: 增强样式类型
  元素样式?: 增强样式类型
  ref?: (el: 按钮基类) => void
}

export abstract class 按钮基类 extends 组件基类<按钮事件, 监听按钮事件> {
  protected 配置: 按钮配置
  private 按钮元素?: HTMLButtonElement
  private 前缀元素?: HTMLSpanElement
  private 文本元素: HTMLSpanElement | undefined
  private 正在执行 = false

  public constructor(配置: 按钮配置 = {}) {
    super()
    this.配置 = { 自动加载: true, 尺寸: '默认', ...配置 }
    this.配置.ref?.(this)
  }

  protected override 当加载时(): void {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)
    if (this.配置.id !== undefined) this.id = this.配置.id

    let 按钮样式 = { ...this.获得按钮样式对象(), ...this.配置.元素样式 }
    let 按钮元素 = 创建元素('button', {
      type: 'button',
      style: 按钮样式,
      title: this.配置.标题 ?? '',
      disabled: this.配置.禁用 === true,
    })
    按钮元素.setAttribute('aria-busy', this.配置.加载中 === true ? 'true' : 'false')
    按钮元素.setAttribute('aria-disabled', this.获得实际禁用() === true ? 'true' : 'false')
    按钮元素.onclick = (event: MouseEvent): void => {
      event.preventDefault()
      this.安全执行(async (): Promise<void> => await this.执行点击(event))
    }
    let 前缀元素 = 创建元素('span', {
      style: { display: 'none', alignItems: 'center', justifyContent: 'center', flexShrink: '0' },
    })
    按钮元素.append(前缀元素)
    this.shadow.append(按钮元素)
    this.按钮元素 = 按钮元素
    this.前缀元素 = 前缀元素
    this.文本元素 = undefined
    this.同步内容()
  }

  protected abstract 获得颜色(): { 背景: string; 文字: string; 边框: string }

  protected 获得按钮样式对象(): 增强样式类型 {
    let 禁用 = this.获得实际禁用()
    let 颜色 = this.获得颜色()
    let 尺寸样式: Record<按钮尺寸, { height: string; padding: string }> = {
      紧凑: { height: 'var(--控件高度-紧凑)', padding: '0 var(--间距-2)' },
      默认: { height: 'var(--控件高度)', padding: '0 var(--间距-3)' },
      宽松: { height: '44px', padding: '0 var(--间距-4)' },
    }
    let 尺寸 = 尺寸样式[this.配置.尺寸 ?? '默认']
    return {
      ...尺寸,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--间距-2)',
      boxSizing: 'border-box',
      borderRadius: 'var(--圆角-中)',
      border: `1px solid ${颜色.边框}`,
      backgroundColor: 颜色.背景,
      color: 颜色.文字,
      cursor: 禁用 ? 'not-allowed' : 'pointer',
      opacity: 禁用 ? '0.55' : '1',
      fontWeight: '500',
      whiteSpace: 'nowrap',
      transition: 'filter var(--动画-快), box-shadow var(--动画-快), transform var(--动画-快)',
    }
  }

  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    this.同步状态()
  }

  public 获得禁用(): boolean {
    return this.配置.禁用 ?? false
  }

  public 设置加载中(值: boolean): void {
    if (this.配置.加载中 === 值) return
    this.配置.加载中 = 值
    this.同步状态()
    this.同步内容()
  }

  public 获得加载中(): boolean {
    return this.配置.加载中 ?? false
  }

  public 获得按钮元素(): HTMLButtonElement | undefined {
    return this.按钮元素
  }

  public 按钮聚焦(): void {
    this.按钮元素?.focus()
  }

  public 设置文本(文本: string): void {
    this.配置.文本 = 文本
    this.同步内容()
  }

  public 设置标题(标题: string): void {
    this.配置.标题 = 标题
    if (this.按钮元素 !== undefined) this.按钮元素.title = 标题
  }

  public 设置图标(图标: Node | undefined): void {
    if (图标 === undefined) delete this.配置.图标
    else this.配置.图标 = 图标
    this.同步内容()
  }

  private async 执行点击(event: MouseEvent): Promise<void> {
    if (this.获得实际禁用() === true || this.正在执行 === true) return
    this.正在执行 = true
    let 自动加载 = this.配置.自动加载 !== false && this.配置.点击处理函数 !== undefined
    if (自动加载 === true) this.设置加载中(true)
    try {
      await this.配置.点击处理函数?.(event)
      this.派发事件('点击', undefined)
    } finally {
      this.正在执行 = false
      if (自动加载 === true) this.设置加载中(false)
    }
  }

  private 获得实际禁用(): boolean {
    return this.配置.禁用 === true || this.配置.加载中 === true
  }

  private 同步状态(): void {
    if (this.按钮元素 === undefined) return
    this.按钮元素.disabled = this.配置.禁用 === true
    this.按钮元素.setAttribute('aria-busy', this.配置.加载中 === true ? 'true' : 'false')
    this.按钮元素.setAttribute('aria-disabled', this.获得实际禁用() === true ? 'true' : 'false')
    应用样式(this.按钮元素, this.获得按钮样式对象())
  }

  private 同步内容(): void {
    if (this.按钮元素 === undefined || this.前缀元素 === undefined) return
    this.前缀元素.replaceChildren()
    let 前缀: Node | undefined = this.配置.加载中 === true ? this.创建加载指示器() : this.配置.图标
    if (前缀 !== undefined) this.前缀元素.append(前缀)
    this.前缀元素.style.display = 前缀 === undefined ? 'none' : 'inline-flex'

    if (this.配置.文本 !== undefined) {
      if (this.文本元素 === undefined) {
        this.文本元素 = 创建元素('span')
        this.按钮元素.append(this.文本元素)
      }
      this.文本元素.textContent = this.配置.文本
    }
  }

  private 创建加载指示器(): HTMLSpanElement {
    let 指示器 = 创建元素('span', {
      style: {
        width: '14px',
        height: '14px',
        border: '2px solid currentColor',
        borderRightColor: 'transparent',
        borderRadius: '50%',
        display: 'inline-block',
      },
    })
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches === false)
      指示器.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
        duration: 700,
        iterations: Infinity,
      })
    return 指示器
  }
}

export class 普通按钮 extends 按钮基类 {
  protected 获得颜色(): { 背景: string; 文字: string; 边框: string } {
    return { 背景: 'var(--按钮背景)', 文字: 'var(--按钮文字)', 边框: 'var(--边框颜色)' }
  }
}

export class 主要按钮 extends 按钮基类 {
  protected 获得颜色(): { 背景: string; 文字: string; 边框: string } {
    return { 背景: 'var(--主色调)', 文字: 'var(--主色调文字)', 边框: 'var(--主色调)' }
  }
}

export class 危险按钮 extends 按钮基类 {
  protected 获得颜色(): { 背景: string; 文字: string; 边框: string } {
    return { 背景: 'var(--错误颜色)', 文字: 'var(--错误文字)', 边框: 'var(--错误颜色)' }
  }
}

export class 成功按钮 extends 按钮基类 {
  protected 获得颜色(): { 背景: string; 文字: string; 边框: string } {
    return { 背景: 'var(--成功颜色)', 文字: 'var(--成功文字)', 边框: 'var(--成功颜色)' }
  }
}

export class 警告按钮 extends 按钮基类 {
  protected 获得颜色(): { 背景: string; 文字: string; 边框: string } {
    return { 背景: 'var(--警告颜色)', 文字: 'var(--警告文字)', 边框: 'var(--警告颜色)' }
  }
}

export class 文本按钮 extends 按钮基类 {
  protected 获得颜色(): { 背景: string; 文字: string; 边框: string } {
    return { 背景: 'transparent', 文字: 'var(--主色调)', 边框: 'transparent' }
  }
}

export class 链接按钮 extends 文本按钮 {
  protected override 获得按钮样式对象(): 增强样式类型 {
    return { ...super.获得按钮样式对象(), height: 'auto', padding: '2px 4px', textDecoration: 'underline' }
  }
}

普通按钮.注册组件('lsby-button-default', 普通按钮)
主要按钮.注册组件('lsby-button-primary', 主要按钮)
危险按钮.注册组件('lsby-button-danger', 危险按钮)
成功按钮.注册组件('lsby-button-success', 成功按钮)
警告按钮.注册组件('lsby-button-warning', 警告按钮)
文本按钮.注册组件('lsby-button-text', 文本按钮)
链接按钮.注册组件('lsby-button-link', 链接按钮)
