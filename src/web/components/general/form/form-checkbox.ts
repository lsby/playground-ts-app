import { 增强样式类型 } from '../../../../web/global/types/style'
import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'
import { 同步表单控件校验状态, 表单组件基类 } from './form'

type 复选框事件 = { 变化: boolean; 失焦: void }

type 监听复选框事件 = {}

type 复选框配置 = {
  标签?: string
  值?: boolean
  禁用?: boolean
  额外提示?: string
  可访问名称?: string
  变化处理函数?: (值: boolean) => void | Promise<void>
  宿主样式?: 增强样式类型
  元素样式?: 增强样式类型
}

class 复选框 extends 表单组件基类<复选框事件, 监听复选框事件, boolean> {
  protected 配置: 复选框配置
  private 复选框元素?: HTMLInputElement
  private 容器元素?: HTMLLabelElement

  public constructor(配置: 复选框配置 = {}) {
    super()
    this.配置 = 配置
  }

  protected async 当加载时(): Promise<void> {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)

    let 容器 = 创建元素('label', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: (this.配置.禁用 ?? false) ? 'not-allowed' : 'pointer',
        ...this.配置.元素样式,
      },
    })

    let 复选框元素 = 创建元素('input', {
      type: 'checkbox',
      checked: this.配置.值 ?? false,
      disabled: this.配置.禁用 ?? false,
      style: { width: '20px', height: '20px' },
    })

    if (this.配置.可访问名称 !== undefined) 复选框元素.setAttribute('aria-label', this.配置.可访问名称)
    复选框元素.onchange = (): void => {
      let 值 = 复选框元素.checked
      this.配置.值 = 值
      this.安全执行(async (): Promise<void> => await this.配置.变化处理函数?.(值))
      this.派发事件('变化', 值)
    }
    复选框元素.onblur = (): void => {
      this.派发事件('失焦', undefined)
    }

    容器.appendChild(复选框元素)

    if (this.配置.标签 !== undefined) {
      let 标签元素 = 创建元素('span', { textContent: this.配置.标签, style: { fontSize: '14px' } })
      容器.appendChild(标签元素)

      if (this.配置.额外提示 !== undefined) {
        let 提示图标 = this.创建提示图标(this.配置.额外提示)
        提示图标.style.marginLeft = '4px'
        容器.appendChild(提示图标)
      }
    }

    this.shadow.appendChild(容器)
    this.复选框元素 = 复选框元素
    this.容器元素 = 容器
  }

  public 设置值(值: boolean): void {
    this.配置.值 = 值
    if (this.复选框元素 !== undefined) {
      this.复选框元素.checked = 值
    }
  }

  public 获得值(): boolean {
    return this.复选框元素?.checked ?? this.配置.值 ?? false
  }

  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    if (this.复选框元素 !== undefined) {
      this.复选框元素.disabled = 值
      this.复选框元素.style.opacity = 值 ? '0.6' : '1'
    }
    if (this.容器元素 !== undefined) this.容器元素.style.cursor = 值 ? 'not-allowed' : 'pointer'
  }

  public 获得禁用(): boolean {
    return this.配置.禁用 ?? false
  }
  public 聚焦(): void {
    this.复选框元素?.focus()
  }
  public 设置可访问名称(名称: string): void {
    this.配置.可访问名称 = 名称
    this.复选框元素?.setAttribute('aria-label', 名称)
  }
  public 设置校验状态(错误: string | null, 描述元素标识列表: string[]): void {
    if (this.复选框元素 !== undefined) 同步表单控件校验状态([this.复选框元素], 错误, 描述元素标识列表)
  }
}

// 注册组件
复选框.注册组件('lsby-form-checkbox', 复选框)

export { 复选框 }
