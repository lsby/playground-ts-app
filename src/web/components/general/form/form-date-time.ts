import { 创建元素, 应用宿主样式, 应用样式 } from '../../../global/tools/create-element'
import { 增强样式类型 } from '../../../global/types/style'
import { 获得表单控件基础样式 } from './control-style'
import { 表单组件基类 } from './form'
import { 同步表单控件校验状态 } from './form-accessibility'

type 日期时间事件 = { 输入: string; 变化: string; 焦点: void; 失焦: void }
type 日期时间模式 = 'date' | 'time' | 'datetime-local'

export type 日期时间输入框配置 = {
  值?: string
  禁用?: boolean
  只读?: boolean
  最小值?: string
  最大值?: string
  步长?: string | number
  可访问名称?: string
  宿主样式?: 增强样式类型
  元素样式?: 增强样式类型
}

abstract class 日期时间输入框基类 extends 表单组件基类<日期时间事件, {}, string> {
  private 模式: 日期时间模式
  private 配置: 日期时间输入框配置
  private 输入元素?: HTMLInputElement

  protected constructor(模式: 日期时间模式, 配置: 日期时间输入框配置) {
    super()
    this.模式 = 模式
    this.配置 = 配置
  }

  protected override 当加载时(): void {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)
    let 输入 = 创建元素('input', {
      type: this.模式,
      value: this.配置.值 ?? '',
      disabled: this.配置.禁用 ?? false,
      readOnly: this.配置.只读 ?? false,
      style: { ...this.获得样式(), ...this.配置.元素样式 },
    })
    if (this.配置.最小值 !== undefined) 输入.min = this.配置.最小值
    if (this.配置.最大值 !== undefined) 输入.max = this.配置.最大值
    if (this.配置.步长 !== undefined) 输入.step = String(this.配置.步长)
    if (this.配置.可访问名称 !== undefined) 输入.setAttribute('aria-label', this.配置.可访问名称)
    输入.oninput = (): void => {
      this.配置.值 = 输入.value
      this.派发事件('输入', 输入.value)
    }
    输入.onchange = (): void => {
      this.配置.值 = 输入.value
      this.派发事件('变化', 输入.value)
    }
    输入.onfocus = (): void => {
      this.派发事件('焦点', undefined)
    }
    输入.onblur = (): void => {
      this.派发事件('失焦', undefined)
    }
    this.输入元素 = 输入
    this.shadow.append(输入)
  }

  public 获得值(): string {
    return this.输入元素?.value ?? this.配置.值 ?? ''
  }

  public 设置值(值: string): void {
    this.配置.值 = 值
    if (this.输入元素 !== undefined) this.输入元素.value = 值
  }

  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    if (this.输入元素 !== undefined) {
      this.输入元素.disabled = 值
      应用样式(this.输入元素, { ...this.获得样式(), ...this.配置.元素样式 })
    }
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
  }

  public 设置校验状态(错误: string | null, 描述文本列表: string[]): void {
    if (this.输入元素 !== undefined) 同步表单控件校验状态([this.输入元素], 错误, 描述文本列表)
  }

  private 获得样式(): 增强样式类型 {
    return 获得表单控件基础样式({ 禁用: this.配置.禁用 ?? false, 光标: 'pointer' })
  }
}

export class 日期输入框 extends 日期时间输入框基类 {
  public constructor(配置: 日期时间输入框配置 = {}) {
    super('date', 配置)
  }
}

export class 时间输入框 extends 日期时间输入框基类 {
  public constructor(配置: 日期时间输入框配置 = {}) {
    super('time', 配置)
  }
}

export class 日期时间输入框 extends 日期时间输入框基类 {
  public constructor(配置: 日期时间输入框配置 = {}) {
    super('datetime-local', 配置)
  }
}

export function 本地日期时间转UTC(值: string): string | null {
  if (值 === '') return null
  let 日期 = new Date(值)
  return Number.isNaN(日期.getTime()) ? null : 日期.toISOString()
}

export function UTC时间转本地输入值(值: string): string | null {
  let 日期 = new Date(值)
  if (Number.isNaN(日期.getTime()) === true) return null
  let 本地毫秒 = 日期.getTime() - 日期.getTimezoneOffset() * 60_000
  return new Date(本地毫秒).toISOString().slice(0, 16)
}

日期输入框.注册组件('lsby-form-date', 日期输入框)
时间输入框.注册组件('lsby-form-time', 时间输入框)
日期时间输入框.注册组件('lsby-form-date-time', 日期时间输入框)
