import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'
import { 增强样式类型 } from '../../../global/types/style'
import { 表单组件基类 } from './form'

type 输入框事件 = { 输入: string; 变化: string; 焦点: void; 失焦: void; 回车: string }
type 监听输入框事件 = {}

export type 输入框配置 = {
  占位符?: string
  值?: string
  禁用?: boolean
  只读?: boolean
  类型?: string
  额外提示?: string
  可访问名称?: string
  自动完成?: string
  输入处理函数?: (值: string) => void | Promise<void>
  变化处理函数?: (值: string) => void | Promise<void>
  焦点处理函数?: () => void | Promise<void>
  失焦处理函数?: (值: string) => void | Promise<void>
  回车处理函数?: (值: string) => void | Promise<void>
  宿主样式?: 增强样式类型
  元素样式?: 增强样式类型
  最小值?: string
  最大值?: string
  步长?: string
}

abstract class 输入框基类 extends 表单组件基类<输入框事件, 监听输入框事件, string> {
  protected 配置: 输入框配置
  private 输入框元素?: HTMLInputElement

  public constructor(配置: 输入框配置 = {}) {
    super()
    this.配置 = 配置
  }

  protected override 当加载时(): void {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)
    let 容器 = 创建元素('div', {
      style: { display: 'flex', alignItems: 'center', width: '100%', gap: 'var(--间距-1)' },
    })
    let 输入框 = 创建元素('input', {
      type: this.配置.类型 ?? 'text',
      placeholder: this.配置.占位符 ?? '',
      value: this.配置.值 ?? '',
      disabled: this.配置.禁用 ?? false,
      readOnly: this.配置.只读 ?? false,
      style: { ...this.获得输入框样式对象(), ...this.配置.元素样式 },
    })
    if (this.配置.最小值 !== undefined) 输入框.min = this.配置.最小值
    if (this.配置.最大值 !== undefined) 输入框.max = this.配置.最大值
    if (this.配置.步长 !== undefined) 输入框.step = this.配置.步长
    if (this.配置.自动完成 !== undefined) 输入框.setAttribute('autocomplete', this.配置.自动完成)
    if (this.配置.可访问名称 !== undefined) 输入框.setAttribute('aria-label', this.配置.可访问名称)
    输入框.oninput = (): void => {
      this.配置.值 = 输入框.value
      this.安全执行(async (): Promise<void> => await this.配置.输入处理函数?.(输入框.value))
      this.派发事件('输入', 输入框.value)
    }
    输入框.onchange = (): void => {
      this.配置.值 = 输入框.value
      this.安全执行(async (): Promise<void> => await this.配置.变化处理函数?.(输入框.value))
      this.派发事件('变化', 输入框.value)
    }
    输入框.onfocus = (): void => {
      this.安全执行(async (): Promise<void> => await this.配置.焦点处理函数?.())
      this.派发事件('焦点', undefined)
    }
    输入框.onblur = (): void => {
      this.配置.值 = 输入框.value
      this.安全执行(async (): Promise<void> => await this.配置.失焦处理函数?.(输入框.value))
      this.派发事件('失焦', undefined)
    }
    输入框.onkeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.isComposing === true) return
      this.安全执行(async (): Promise<void> => await this.配置.回车处理函数?.(输入框.value))
      this.派发事件('回车', 输入框.value)
    }
    容器.append(输入框)
    if (this.配置.额外提示 !== undefined) 容器.append(this.创建提示图标(this.配置.额外提示))
    this.shadow.append(容器)
    this.输入框元素 = 输入框
  }

  protected 获得输入框样式对象(): 增强样式类型 {
    let 禁用 = this.配置.禁用 ?? false
    return {
      width: '100%',
      height: 'var(--控件高度)',
      padding: '0 var(--间距-3)',
      boxSizing: 'border-box',
      border: '1px solid var(--边框颜色)',
      borderRadius: 'var(--圆角-中)',
      outline: 'none',
      backgroundColor: 禁用 ? 'var(--禁用背景)' : 'var(--输入框背景)',
      color: 'var(--文字颜色)',
      cursor: 禁用 ? 'not-allowed' : 'text',
      opacity: 禁用 ? '0.6' : '1',
      transition: 'border-color var(--动画-快), box-shadow var(--动画-快)',
    }
  }

  public 设置值(值: string): void {
    this.配置.值 = 值
    if (this.输入框元素 !== undefined) this.输入框元素.value = 值
  }

  public 获得值(): string {
    return this.输入框元素?.value ?? this.配置.值 ?? ''
  }

  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    if (this.输入框元素 !== undefined) this.输入框元素.disabled = 值
  }

  public 获得禁用(): boolean {
    return this.配置.禁用 ?? false
  }

  public 设置只读(值: boolean): void {
    this.配置.只读 = 值
    if (this.输入框元素 !== undefined) this.输入框元素.readOnly = 值
  }

  public 获得只读(): boolean {
    return this.配置.只读 ?? false
  }
  public 聚焦(): void {
    this.输入框元素?.focus()
  }
  public 失焦(): void {
    this.输入框元素?.blur()
  }

  public 设置占位符(占位符: string): void {
    this.配置.占位符 = 占位符
    if (this.输入框元素 !== undefined) this.输入框元素.placeholder = 占位符
  }

  public 设置可访问名称(名称: string): void {
    this.配置.可访问名称 = 名称
    this.输入框元素?.setAttribute('aria-label', 名称)
  }
}

export class 普通输入框 extends 输入框基类 {}

export class 密码输入框 extends 输入框基类 {
  public constructor(配置: 输入框配置 = {}) {
    super({ ...配置, 类型: 'password' })
  }
}

export class 数字输入框 extends 输入框基类 {
  public constructor(配置: 输入框配置 = {}) {
    super({ ...配置, 类型: 'number' })
  }
}

普通输入框.注册组件('lsby-form-input-default', 普通输入框)
密码输入框.注册组件('lsby-form-input-password', 密码输入框)
数字输入框.注册组件('lsby-form-input-number', 数字输入框)
