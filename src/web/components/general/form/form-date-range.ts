import { 创建元素, 应用宿主样式, 应用样式 } from '../../../global/tools/create-element'
import { 增强样式类型 } from '../../../global/types/style'
import { 获得表单控件基础样式 } from './control-style'
import { 表单组件基类 } from './form'
import { 同步表单控件校验状态 } from './form-accessibility'

export type 日期范围值 = [string, string]
export type 日期范围配置 = {
  值?: 日期范围值
  禁用?: boolean
  最小值?: string
  最大值?: string
  可访问名称?: string
  宿主样式?: 增强样式类型
  元素样式?: 增强样式类型
}
type 日期范围事件 = { 变化: 日期范围值; 失焦: void }

export class 日期范围输入框 extends 表单组件基类<日期范围事件, {}, 日期范围值> {
  static {
    this.注册组件('lsby-form-date-range', this)
  }

  private 配置: 日期范围配置
  private 开始输入?: HTMLInputElement
  private 结束输入?: HTMLInputElement

  public constructor(配置: 日期范围配置 = {}) {
    super()
    this.配置 = 配置
  }

  protected override 当加载时(): void {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)
    let 容器 = 创建元素('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        alignItems: 'center',
        gap: 'var(--间距-2)',
      },
    })
    let 开始输入 = this.创建输入('开始', this.配置.值?.[0] ?? '')
    let 结束输入 = this.创建输入('结束', this.配置.值?.[1] ?? '')
    开始输入.onchange = (): void => this.处理变化()
    结束输入.onchange = (): void => this.处理变化()
    let 失焦计时器: number | null = null
    let 处理失焦 = (): void => {
      if (失焦计时器 !== null) window.clearTimeout(失焦计时器)
      失焦计时器 = window.setTimeout((): void => {
        失焦计时器 = null
        if (this.shadow.activeElement === 开始输入 || this.shadow.activeElement === 结束输入) return
        this.派发事件('失焦', undefined)
      })
    }
    开始输入.onblur = 处理失焦
    结束输入.onblur = 处理失焦
    this.开始输入 = 开始输入
    this.结束输入 = 结束输入
    容器.append(开始输入, 创建元素('span', { textContent: '至', style: { color: 'var(--次要文字颜色)' } }), 结束输入)
    this.shadow.append(容器)
    this.注册清理((): void => {
      if (失焦计时器 !== null) window.clearTimeout(失焦计时器)
    })
  }

  public 获得值(): 日期范围值 {
    return [this.开始输入?.value ?? this.配置.值?.[0] ?? '', this.结束输入?.value ?? this.配置.值?.[1] ?? '']
  }

  public 设置值(值: 日期范围值): void {
    this.配置.值 = [...值]
    if (this.开始输入 !== undefined) this.开始输入.value = 值[0]
    if (this.结束输入 !== undefined) this.结束输入.value = 值[1]
  }

  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    for (let 输入 of [this.开始输入, this.结束输入]) {
      if (输入 === undefined) continue
      输入.disabled = 值
      应用样式(输入, { ...this.获得样式(), ...this.配置.元素样式 })
    }
  }

  public 获得禁用(): boolean {
    return this.配置.禁用 ?? false
  }

  public 聚焦(): void {
    this.开始输入?.focus()
  }

  public 设置可访问名称(名称: string): void {
    this.配置.可访问名称 = 名称
    this.开始输入?.setAttribute('aria-label', `${名称}开始`)
    this.结束输入?.setAttribute('aria-label', `${名称}结束`)
  }

  public 设置校验状态(错误: string | null, 描述文本列表: string[]): void {
    同步表单控件校验状态(
      [this.开始输入, this.结束输入].filter((输入): 输入 is HTMLInputElement => 输入 !== undefined),
      错误,
      描述文本列表,
    )
  }

  private 创建输入(名称: '开始' | '结束', 值: string): HTMLInputElement {
    let 输入 = 创建元素('input', {
      type: 'date',
      value: 值,
      disabled: this.配置.禁用 ?? false,
      style: { ...this.获得样式(), ...this.配置.元素样式 },
    })
    输入.setAttribute('aria-label', `${this.配置.可访问名称 ?? '日期范围'}${名称}`)
    if (this.配置.最小值 !== undefined) 输入.min = this.配置.最小值
    if (this.配置.最大值 !== undefined) 输入.max = this.配置.最大值
    return 输入
  }

  private 处理变化(): void {
    let 值 = this.获得值()
    this.配置.值 = 值
    this.派发事件('变化', 值)
  }

  private 获得样式(): 增强样式类型 {
    return 获得表单控件基础样式({ 禁用: this.配置.禁用 ?? false, 光标: 'pointer' })
  }
}
