import { 增强样式类型 } from '../../../../web/global/types/style'
import { 组件基类 } from '../../../base/base'
import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'
import type { 表单元素 } from './form'

export type 多选下拉框选项 = { 文字: string; value: string }

type 多选下拉框事件 = { 变化: string[]; 失焦: void }
type 监听多选下拉框事件 = {}

type 多选下拉框配置 = {
  占位符?: string
  打开处理函数?: () => void | Promise<void>
  变化处理函数?: (选中值列表: string[]) => void | Promise<void>
  宿主样式?: 增强样式类型
  值?: string[]
  禁用?: boolean
  可访问名称?: string
}

export class 多选下拉框 extends 组件基类<多选下拉框事件, 监听多选下拉框事件> implements 表单元素<string[]> {
  private 配置: 多选下拉框配置
  private 展开状态 = false
  private 当前输入列表: HTMLInputElement[] = []
  private 显示文本?: HTMLSpanElement
  private 箭头?: HTMLSpanElement
  private 浮动面板?: HTMLDivElement
  private 容器元素?: HTMLDivElement

  public constructor(配置: 多选下拉框配置 = {}) {
    super()
    this.配置 = 配置
  }

  protected async 当加载时(): Promise<void> {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)

    let 占位符文字 = this.配置.占位符 ?? '-- 点击选择 --'

    let 触发框 = 创建元素('div', {
      style: {
        padding: '6px 10px',
        fontSize: '14px',
        border: '1px solid var(--边框颜色)',
        borderRadius: '4px',
        backgroundColor: 'var(--输入框背景)',
        color: 'var(--文字颜色)',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxSizing: 'border-box',
      },
    })
    触发框.tabIndex = this.配置.禁用 === true ? -1 : 0
    触发框.setAttribute('role', 'combobox')
    触发框.setAttribute('aria-expanded', 'false')
    if (this.配置.可访问名称 !== undefined) 触发框.setAttribute('aria-label', this.配置.可访问名称)

    this.显示文本 = 创建元素('span', { textContent: 占位符文字 })
    this.箭头 = 创建元素('span', { textContent: '▼', style: { fontSize: '10px', transition: 'transform 0.2s' } })
    触发框.appendChild(this.显示文本)
    触发框.appendChild(this.箭头)

    this.浮动面板 = 创建元素('div', {
      style: {
        display: 'none',
        position: 'absolute',
        top: '100%',
        left: '0',
        right: '0',
        zIndex: '9999',
        border: '1px solid var(--边框颜色)',
        borderRadius: '4px',
        backgroundColor: 'var(--背景颜色)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '6px 0',
        maxHeight: '200px',
        overflowY: 'auto',
      },
    })

    let 容器 = 创建元素('div', { style: { position: 'relative' } })
    容器.appendChild(触发框)
    容器.appendChild(this.浮动面板)
    容器.tabIndex = -1
    this.容器元素 = 容器

    触发框.onclick = (): void => {
      if (this.配置.禁用 === true) return
      this.展开状态 = !this.展开状态
      if (this.展开状态 === true) {
        this.安全执行(async (): Promise<void> => await this.配置.打开处理函数?.())
        if (this.浮动面板 !== undefined) this.浮动面板.style.display = 'block'
        if (this.箭头 !== undefined) this.箭头.style.transform = 'rotate(180deg)'
        触发框.setAttribute('aria-expanded', 'true')
        容器.focus()
      } else {
        this.关闭面板()
      }
    }

    let 失去焦点 = (e: FocusEvent): void => {
      if (e.relatedTarget instanceof Node === false || 容器.contains(e.relatedTarget) === false) {
        this.关闭面板()
        this.派发事件('失焦', undefined)
      }
    }
    容器.addEventListener('focusout', 失去焦点)
    this.注册清理((): void => 容器.removeEventListener('focusout', 失去焦点))

    this.shadow.appendChild(容器)
  }

  private 关闭面板(): void {
    this.展开状态 = false
    if (this.浮动面板 !== undefined) this.浮动面板.style.display = 'none'
    if (this.箭头 !== undefined) this.箭头.style.transform = 'rotate(0deg)'
  }

  private 更新显示文本(): void {
    let 占位符文字 = this.配置.占位符 ?? '-- 点击选择 --'
    let 选中 = this.当前输入列表.filter((i) => i.checked)
    if (this.显示文本 !== undefined) {
      this.显示文本.textContent = 选中.length === 0 ? 占位符文字 : `已选 ${选中.length} 项`
    }
  }

  public 刷新列表(选项列表: 多选下拉框选项[]): void {
    if (this.浮动面板 === undefined) return
    let 之前选中 = new Set(this.当前输入列表.filter((i) => i.checked).map((i) => i.value))
    this.浮动面板.innerHTML = ''
    this.当前输入列表 = []
    for (let 选项 of 选项列表) {
      let 行 = 创建元素('div', {
        style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', cursor: 'pointer' },
      })
      let input = 创建元素('input', { type: 'checkbox', value: 选项.value, style: { cursor: 'pointer' } })
      if (之前选中.has(选项.value) || (this.配置.值 ?? []).includes(选项.value)) input.checked = true
      let text = 创建元素('span', { textContent: 选项.文字, style: { fontSize: '13px', color: 'var(--文字颜色)' } })
      行.appendChild(input)
      行.appendChild(text)
      行.onclick = (e): void => {
        if (e.target !== input) input.checked = !input.checked
        this.更新显示文本()
        let 选中值 = this.获得值()
        this.配置.值 = 选中值
        this.安全执行(async (): Promise<void> => await this.配置.变化处理函数?.(选中值))
        this.派发事件('变化', 选中值)
      }
      input.onchange = (): void => {
        this.更新显示文本()
        let 选中值 = this.获得值()
        this.配置.值 = 选中值
        this.安全执行(async (): Promise<void> => await this.配置.变化处理函数?.(选中值))
        this.派发事件('变化', 选中值)
      }
      this.浮动面板.appendChild(行)
      this.当前输入列表.push(input)
    }
    this.更新显示文本()
  }

  public 获得选中输入列表(): HTMLInputElement[] {
    return this.当前输入列表.filter((i) => i.checked)
  }

  public 获得值(): string[] {
    if (this.当前输入列表.length === 0) return [...(this.配置.值 ?? [])]
    return this.获得选中输入列表().map((i) => i.value)
  }

  public 设置值(值: string[]): void {
    this.配置.值 = [...值]
    for (let input of this.当前输入列表) {
      input.checked = 值.includes(input.value)
    }
    this.更新显示文本()
  }

  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    void this.刷新()
  }
  public 获得禁用(): boolean {
    return this.配置.禁用 ?? false
  }
  public 聚焦(): void {
    this.容器元素?.focus()
  }
  public 设置可访问名称(名称: string): void {
    this.配置.可访问名称 = 名称
    void this.刷新()
  }
}

多选下拉框.注册组件('lsby-form-multi-select', 多选下拉框)
