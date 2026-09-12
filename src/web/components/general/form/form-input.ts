import { 创建元素, 应用宿主样式, 应用样式 } from '../../../global/tools/create-element'
import { 增强样式类型 } from '../../../global/types/style'
import { 获得表单控件基础样式 } from './control-style'
import { 表单组件基类 } from './form'
import { 同步表单控件校验状态 } from './form-accessibility'

type 输入框事件<值类型> = { 输入: 值类型; 变化: 值类型; 焦点: void; 失焦: void; 回车: 值类型 }
type 监听输入框事件 = {}

type 基础输入框配置<值类型> = {
  占位符?: string
  值?: 值类型
  禁用?: boolean
  只读?: boolean
  类型?: string
  额外提示?: string
  可访问名称?: string
  自动完成?: string
  宿主样式?: 增强样式类型
  元素样式?: 增强样式类型
  最小值?: string | number
  最大值?: string | number
  步长?: string | number
}

export type 输入框配置 = 基础输入框配置<string>
export type 数字输入框配置 = Omit<基础输入框配置<number | null>, '类型'>

abstract class 输入框基类<值类型 extends string | number | null> extends 表单组件基类<
  输入框事件<值类型>,
  监听输入框事件,
  值类型
> {
  protected 配置: 基础输入框配置<值类型>
  private 输入框元素?: HTMLInputElement

  public constructor(配置: 基础输入框配置<值类型>) {
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
      value: this.配置.值 === null || this.配置.值 === undefined ? '' : String(this.配置.值),
      disabled: this.配置.禁用 ?? false,
      readOnly: this.配置.只读 ?? false,
      style: { ...this.获得输入框样式对象(), ...this.配置.元素样式 },
    })
    if (this.配置.最小值 !== undefined) 输入框.min = String(this.配置.最小值)
    if (this.配置.最大值 !== undefined) 输入框.max = String(this.配置.最大值)
    if (this.配置.步长 !== undefined) 输入框.step = String(this.配置.步长)
    if (this.配置.自动完成 !== undefined) 输入框.setAttribute('autocomplete', this.配置.自动完成)
    if (this.配置.可访问名称 !== undefined) 输入框.setAttribute('aria-label', this.配置.可访问名称)
    输入框.oninput = (): void => {
      let 值 = this.读取并保存值(输入框)
      this.派发事件('输入', 值)
    }
    输入框.onchange = (): void => {
      let 值 = this.读取并保存值(输入框)
      this.派发事件('变化', 值)
    }
    输入框.onfocus = (): void => {
      this.派发事件('焦点', undefined)
    }
    输入框.onblur = (): void => {
      this.读取并保存值(输入框)
      this.派发事件('失焦', undefined)
    }
    输入框.onkeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.isComposing === true) return
      this.派发事件('回车', this.读取并保存值(输入框))
    }
    容器.append(输入框)
    if (this.配置.额外提示 !== undefined) 容器.append(this.创建提示图标(this.配置.额外提示))
    this.shadow.append(容器)
    this.输入框元素 = 输入框
  }

  protected abstract 从输入元素读取值(元素: HTMLInputElement): 值类型
  protected abstract 获得空值时配置值(): 值类型

  protected 获得输入框样式对象(): 增强样式类型 {
    let 禁用 = this.配置.禁用 ?? false
    return 获得表单控件基础样式({ 禁用, 光标: 'text' })
  }

  public 设置值(值: 值类型): void {
    this.配置.值 = 值
    if (this.输入框元素 !== undefined) this.输入框元素.value = 值 === null ? '' : String(值)
  }

  public 获得值(): 值类型 {
    if (this.输入框元素 !== undefined) return this.从输入元素读取值(this.输入框元素)
    return this.获得空值时配置值()
  }

  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    if (this.输入框元素 !== undefined) {
      this.输入框元素.disabled = 值
      应用样式(this.输入框元素, { ...this.获得输入框样式对象(), ...this.配置.元素样式 })
    }
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

  public 设置校验状态(错误: string | null, 描述文本列表: string[]): void {
    if (this.输入框元素 !== undefined) 同步表单控件校验状态([this.输入框元素], 错误, 描述文本列表)
  }

  private 读取并保存值(元素: HTMLInputElement): 值类型 {
    let 值 = this.从输入元素读取值(元素)
    this.配置.值 = 值
    return 值
  }
}

export class 普通输入框 extends 输入框基类<string> {
  public constructor(配置: 输入框配置 = {}) {
    super(配置)
  }

  protected 从输入元素读取值(元素: HTMLInputElement): string {
    return 元素.value
  }

  protected 获得空值时配置值(): string {
    return this.配置.值 ?? ''
  }
}

export class 密码输入框 extends 普通输入框 {
  public constructor(配置: 输入框配置 = {}) {
    super({ ...配置, 类型: 'password' })
  }
}

export class 数字输入框 extends 输入框基类<number | null> {
  public constructor(配置: 数字输入框配置 = {}) {
    super({ ...配置, 类型: 'number' })
  }

  protected 从输入元素读取值(元素: HTMLInputElement): number | null {
    if (元素.value === '' || Number.isNaN(元素.valueAsNumber) === true) return null
    return 元素.valueAsNumber
  }

  protected 获得空值时配置值(): number | null {
    return this.配置.值 ?? null
  }
}

普通输入框.注册组件('lsby-form-input-default', 普通输入框)
密码输入框.注册组件('lsby-form-input-password', 密码输入框)
数字输入框.注册组件('lsby-form-input-number', 数字输入框)
