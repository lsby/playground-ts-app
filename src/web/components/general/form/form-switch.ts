import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'
import { 增强样式类型 } from '../../../global/types/style'
import { 同步表单控件校验状态, 表单组件基类 } from './form'

type 开关事件 = { 变化: boolean; 失焦: void }
type 开关配置 = {
  标签?: string
  值?: boolean
  禁用?: boolean
  可访问名称?: string
  变化处理函数?: (值: boolean) => void | Promise<void>
  宿主样式?: 增强样式类型
}

export class 开关组件 extends 表单组件基类<开关事件, {}, boolean> {
  static {
    this.注册组件('lsby-form-switch', this)
  }
  private 配置: 开关配置
  private 输入元素?: HTMLInputElement
  private 标签元素?: HTMLLabelElement
  private 轨道元素?: HTMLSpanElement
  private 滑块元素?: HTMLSpanElement
  public constructor(配置: 开关配置 = {}) {
    super()
    this.配置 = 配置
  }
  protected override 当加载时(): void {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)
    let 标签 = 创建元素('label', {
      style: {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--间距-2)',
        cursor: this.配置.禁用 === true ? 'not-allowed' : 'pointer',
      },
    })
    let 输入 = 创建元素('input', {
      type: 'checkbox',
      role: 'switch',
      checked: this.配置.值 ?? false,
      disabled: this.配置.禁用 ?? false,
      style: {
        position: 'absolute',
        zIndex: '1',
        top: '0',
        left: '0',
        width: '40px',
        height: '22px',
        margin: '0',
        opacity: '0',
        cursor: this.配置.禁用 === true ? 'not-allowed' : 'pointer',
      },
    })
    let 轨道 = 创建元素('span', {
      style: {
        position: 'relative',
        display: 'inline-block',
        width: '40px',
        height: '22px',
        borderRadius: '999px',
        backgroundColor: 输入.checked ? 'var(--主色调)' : 'var(--边框颜色)',
        transition: 'background-color var(--动画-快)',
      },
    })
    let 滑块 = 创建元素('span', {
      style: {
        position: 'absolute',
        top: '3px',
        left: 输入.checked ? '21px' : '3px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        backgroundColor: 'white',
        boxShadow: 'var(--浅阴影)',
        transition: 'left var(--动画-快)',
      },
    })
    轨道.append(滑块)
    输入.onchange = (): void => {
      this.配置.值 = 输入.checked
      this.同步视觉状态()
      this.安全执行(async (): Promise<void> => await this.配置.变化处理函数?.(输入.checked))
      this.派发事件('变化', 输入.checked)
    }
    输入.onblur = (): void => {
      this.派发事件('失焦', undefined)
    }
    if (this.配置.可访问名称 !== undefined) 输入.setAttribute('aria-label', this.配置.可访问名称)
    标签.append(输入, 轨道)
    if (this.配置.标签 !== undefined) 标签.append(创建元素('span', { textContent: this.配置.标签 }))
    this.shadow.append(标签)
    this.输入元素 = 输入
    this.标签元素 = 标签
    this.轨道元素 = 轨道
    this.滑块元素 = 滑块
  }
  public 获得值(): boolean {
    return this.输入元素?.checked ?? this.配置.值 ?? false
  }
  public 设置值(值: boolean): void {
    this.配置.值 = 值
    if (this.输入元素 !== undefined) {
      this.输入元素.checked = 值
      this.同步视觉状态()
    }
  }
  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    if (this.输入元素 !== undefined) {
      this.输入元素.disabled = 值
      this.输入元素.style.cursor = 值 ? 'not-allowed' : 'pointer'
    }
    if (this.标签元素 !== undefined) this.标签元素.style.cursor = 值 ? 'not-allowed' : 'pointer'
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
  public 设置校验状态(错误: string | null, 描述元素标识列表: string[]): void {
    if (this.输入元素 !== undefined) 同步表单控件校验状态([this.输入元素], 错误, 描述元素标识列表)
  }
  private 同步视觉状态(): void {
    let 已选中 = this.输入元素?.checked ?? this.配置.值 ?? false
    if (this.轨道元素 !== undefined) this.轨道元素.style.backgroundColor = 已选中 ? 'var(--主色调)' : 'var(--边框颜色)'
    if (this.滑块元素 !== undefined) this.滑块元素.style.left = 已选中 ? '21px' : '3px'
  }
}
