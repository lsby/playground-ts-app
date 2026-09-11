import { 增强样式类型 } from '../../../../web/global/types/style'
import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'
import { 同步表单控件校验状态, 表单组件基类 } from './form'

type 复选框组事件 = { 变化: string[]; 失焦: void }

type 监听复选框组事件 = {}

export type 复选框组配置 = {
  选项列表?: string[]
  选中值列表?: string[]
  禁用?: boolean
  额外提示?: string
  可访问名称?: string
  变化处理函数?: (选中值列表: string[]) => void | Promise<void>
  宿主样式?: 增强样式类型
  元素样式?: 增强样式类型
}

class 复选框组 extends 表单组件基类<复选框组事件, 监听复选框组事件, string[]> {
  protected 配置: 复选框组配置
  private 复选框元素们: HTMLInputElement[] = []
  private 容器元素?: HTMLDivElement

  public constructor(配置: 复选框组配置 = {}) {
    super()
    this.配置 = 配置
  }

  protected async 当加载时(): Promise<void> {
    this.复选框元素们 = []
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)

    let 容器 = 创建元素('div', {
      role: 'group',
      style: { display: 'flex', flexDirection: 'column', gap: '8px', ...this.配置.元素样式 },
    })
    if (this.配置.可访问名称 !== undefined) 容器.setAttribute('aria-label', this.配置.可访问名称)

    if (this.配置.选项列表 !== undefined) {
      for (let 选项 of this.配置.选项列表) {
        let 选项容器 = 创建元素('label', {
          style: {
            display: 'flex',
            alignItems: 'center',
            cursor: (this.配置.禁用 ?? false) ? 'not-allowed' : 'pointer',
          },
        })

        let 复选框 = 创建元素('input', {
          type: 'checkbox',
          value: 选项,
          checked: this.配置.选中值列表?.includes(选项) ?? false,
          disabled: this.配置.禁用 ?? false,
          style: { marginRight: '8px' },
        })

        let 文本 = 创建元素('span', { textContent: 选项 })

        复选框.onchange = (): void => {
          let 选中值列表 = this.获得选中值列表()
          this.配置.选中值列表 = 选中值列表
          this.安全执行(async (): Promise<void> => await this.配置.变化处理函数?.(选中值列表))
          this.派发事件('变化', 选中值列表)
        }
        选项容器.appendChild(复选框)
        选项容器.appendChild(文本)
        容器.appendChild(选项容器)
        this.复选框元素们.push(复选框)
      }
    }

    if (this.配置.额外提示 !== undefined) {
      let 提示容器 = 创建元素('div', { style: { display: 'flex', alignItems: 'center', marginTop: '4px' } })
      let 提示图标 = this.创建提示图标(this.配置.额外提示)
      提示容器.appendChild(提示图标)
      容器.appendChild(提示容器)
    }
    let 处理失焦 = (事件: FocusEvent): void => {
      let 下一焦点 = 事件.relatedTarget
      if (下一焦点 instanceof Node && 容器.contains(下一焦点) === true) return
      this.派发事件('失焦', undefined)
    }
    容器.addEventListener('focusout', 处理失焦)
    this.注册清理((): void => 容器.removeEventListener('focusout', 处理失焦))

    this.shadow.appendChild(容器)
    this.容器元素 = 容器
  }

  public 设置选中值列表(选中值列表: string[]): void {
    this.配置.选中值列表 = [...选中值列表]
    for (let 复选框 of this.复选框元素们) {
      复选框.checked = 选中值列表.includes(复选框.value)
    }
  }

  public 获得选中值列表(): string[] {
    if (this.复选框元素们.length === 0) return [...(this.配置.选中值列表 ?? [])]
    return this.复选框元素们.filter((复选框) => 复选框.checked).map((复选框) => 复选框.value)
  }

  /**
   * 实现表单元素接口: 获得值
   * @returns 选中值列表
   */
  public 获得值(): string[] {
    return this.获得选中值列表()
  }

  /**
   * 实现表单元素接口: 设置值
   * @param 值 要设置的值列表
   */
  public 设置值(值: string[]): void {
    if (Array.isArray(值)) {
      this.设置选中值列表(值)
    }
  }

  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    for (let 复选框 of this.复选框元素们) {
      复选框.disabled = 值
      if (复选框.parentElement instanceof HTMLLabelElement)
        复选框.parentElement.style.cursor = 值 ? 'not-allowed' : 'pointer'
    }
  }

  public 获得禁用(): boolean {
    return this.配置.禁用 ?? false
  }
  public 聚焦(): void {
    this.复选框元素们[0]?.focus()
  }
  public 设置可访问名称(名称: string): void {
    this.配置.可访问名称 = 名称
    this.容器元素?.setAttribute('aria-label', 名称)
  }
  public 设置校验状态(错误: string | null, 描述元素标识列表: string[]): void {
    同步表单控件校验状态(this.复选框元素们, 错误, 描述元素标识列表)
  }
}

// 注册组件
复选框组.注册组件('lsby-form-checkbox-group', 复选框组)

export { 复选框组 }
