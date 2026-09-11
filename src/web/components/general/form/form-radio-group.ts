import { 增强样式类型 } from '../../../../web/global/types/style'
import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'
import { 同步表单控件校验状态, 表单组件基类 } from './form'

type 单选框组事件 = { 变化: string; 失焦: void }

type 监听单选框组事件 = {}

type 单选框组配置<值类型 extends string> = {
  选项列表?: 值类型[]
  选项翻译?: Partial<Record<值类型, string>>
  值?: 值类型
  禁用?: boolean
  额外提示?: string
  可访问名称?: string
  变化处理函数?: (值: 值类型) => void | Promise<void>
  宿主样式?: 增强样式类型
  元素样式?: 增强样式类型
  方向?: '横' | '竖'
  标签?: string
}

let 单选框组序号 = 0

class 单选框组<值类型 extends string = string> extends 表单组件基类<单选框组事件, 监听单选框组事件, 值类型> {
  protected 配置: 单选框组配置<值类型>
  private 单选框元素们: HTMLInputElement[] = []
  private 组名: string
  private 容器元素?: HTMLDivElement

  public constructor(配置: 单选框组配置<值类型> = {}) {
    super()
    单选框组序号 += 1
    this.组名 = `radio-group-${单选框组序号}`
    this.配置 = 配置
  }

  protected async 当加载时(): Promise<void> {
    this.单选框元素们 = []
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)

    if (this.配置.标签 !== undefined || this.配置.额外提示 !== undefined) {
      let 头部 = 创建元素('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' } })

      if (this.配置.标签 !== undefined) {
        let 标签元素 = 创建元素('span', {
          textContent: this.配置.标签,
          style: { fontSize: '14px', color: 'var(--文字颜色)' },
        })
        头部.appendChild(标签元素)
      }

      if (this.配置.额外提示 !== undefined) {
        let 提示图标 = this.创建提示图标(this.配置.额外提示)
        头部.appendChild(提示图标)
      }

      this.shadow.appendChild(头部)
    }

    let 容器 = 创建元素('div', {
      role: 'radiogroup',
      style: {
        display: 'flex',
        flexDirection: this.配置.方向 === '横' ? 'row' : 'column',
        gap: '8px',
        ...this.配置.元素样式,
      },
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

        let 单选框 = 创建元素('input', {
          type: 'radio',
          name: this.组名,
          value: 选项,
          checked: this.配置.值 === 选项,
          disabled: this.配置.禁用 ?? false,
          style: { marginRight: '8px' },
        })

        let 文本 = 创建元素('span', { textContent: this.配置.选项翻译?.[选项] ?? 选项 })

        单选框.onchange = (): void => {
          let 值 = 单选框.value as 值类型
          this.配置.值 = 值
          this.安全执行(async (): Promise<void> => await this.配置.变化处理函数?.(值))
          this.派发事件('变化', 值)
        }
        选项容器.appendChild(单选框)
        选项容器.appendChild(文本)
        容器.appendChild(选项容器)
        this.单选框元素们.push(单选框)
      }
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

  public 设置值(值: 值类型): void {
    this.配置.值 = 值
    for (let 单选框 of this.单选框元素们) {
      单选框.checked = 单选框.value === 值
    }
  }

  public 获得值(): 值类型 {
    return (this.单选框元素们.find((单选框) => 单选框.checked)?.value ?? this.配置.值 ?? '') as 值类型
  }

  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    for (let 单选框 of this.单选框元素们) {
      单选框.disabled = 值
      if (单选框.parentElement instanceof HTMLLabelElement)
        单选框.parentElement.style.cursor = 值 ? 'not-allowed' : 'pointer'
    }
  }

  public 获得禁用(): boolean {
    return this.配置.禁用 ?? false
  }
  public 聚焦(): void {
    let 选中项 = this.单选框元素们.find((单选框): boolean => 单选框.checked)
    let 目标 = 选中项 ?? this.单选框元素们[0]
    目标?.focus()
  }
  public 设置可访问名称(名称: string): void {
    this.配置.可访问名称 = 名称
    this.容器元素?.setAttribute('aria-label', 名称)
  }
  public 设置校验状态(错误: string | null, 描述元素标识列表: string[]): void {
    同步表单控件校验状态(this.单选框元素们, 错误, 描述元素标识列表)
  }
}

// 注册组件
单选框组.注册组件('lsby-form-radio-group', 单选框组)

export { 单选框组 }
