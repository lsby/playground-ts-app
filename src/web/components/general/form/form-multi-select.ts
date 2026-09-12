import { 增强样式类型 } from '../../../../web/global/types/style'
import { 组件基类 } from '../../../base/base'
import { 浮层管理器, type 浮层句柄 } from '../../../global/manager/overlay-manager'
import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'
import { 创建图标 } from '../base/icon'
import { 获得表单控件基础样式 } from './control-style'
import { 同步表单控件校验状态, type 表单元素 } from './form'

export type 多选下拉框选项 = { 文字: string; value: string }

type 多选下拉框事件 = { 打开: void; 变化: string[]; 失焦: void }
type 监听多选下拉框事件 = {}

let 多选下拉框序号 = 0

export type 多选下拉框配置 = {
  占位符?: string
  宿主样式?: 增强样式类型
  值?: string[]
  禁用?: boolean
  可访问名称?: string
}

export class 多选下拉框 extends 组件基类<多选下拉框事件, 监听多选下拉框事件> implements 表单元素<string[]> {
  private 配置: 多选下拉框配置
  private 展开状态 = false
  private 当前输入列表: HTMLInputElement[] = []
  private 当前选项元素列表: HTMLDivElement[] = []
  private 当前选中标记列表: SVGSVGElement[] = []
  private 显示文本?: HTMLSpanElement
  private 箭头?: SVGSVGElement
  private 浮动面板?: HTMLDivElement
  private 触发按钮?: HTMLButtonElement
  private 浮层句柄: 浮层句柄 | null = null
  private 选项列表: 多选下拉框选项[] = []
  private 面板id: string

  public constructor(配置: 多选下拉框配置 = {}) {
    super()
    多选下拉框序号 += 1
    this.面板id = `multi-select-panel-${多选下拉框序号}`
    this.配置 = 配置
  }

  protected async 当加载时(): Promise<void> {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)

    let 占位符文字 = this.配置.占位符 ?? '-- 点击选择 --'

    this.当前输入列表 = []
    this.当前选项元素列表 = []
    this.当前选中标记列表 = []
    let 触发框 = 创建元素('button', {
      type: 'button',
      disabled: this.配置.禁用 ?? false,
      style: {
        ...获得表单控件基础样式({ 禁用: this.配置.禁用 ?? false, 光标: 'pointer' }),
        userSelect: 'none',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        textAlign: 'left',
      },
    })
    触发框.setAttribute('role', 'combobox')
    触发框.setAttribute('aria-expanded', 'false')
    触发框.setAttribute('aria-controls', this.面板id)
    触发框.setAttribute('aria-haspopup', 'listbox')
    if (this.配置.可访问名称 !== undefined) 触发框.setAttribute('aria-label', this.配置.可访问名称)

    this.显示文本 = 创建元素('span', { textContent: 占位符文字 })
    this.箭头 = 创建图标('chevron-down', 14)
    this.箭头.style.transition = 'transform var(--动画-正常)'
    触发框.appendChild(this.显示文本)
    触发框.appendChild(this.箭头)

    this.浮动面板 = 创建元素('div', {
      id: this.面板id,
      role: 'listbox',
      style: {
        position: 'fixed',
        inset: 'unset',
        margin: '0',
        border: '1px solid var(--边框颜色)',
        borderRadius: 'var(--圆角-小)',
        backgroundColor: 'var(--背景颜色)',
        boxShadow: 'var(--浅阴影)',
        padding: '6px 0',
        maxHeight: '200px',
        overflowY: 'auto',
        boxSizing: 'border-box',
      },
    })
    this.浮动面板.setAttribute('aria-multiselectable', 'true')
    this.浮动面板.setAttribute('aria-label', `${this.配置.可访问名称 ?? '多选'}选项`)

    let 容器 = 创建元素('div', { style: { position: 'relative' } })
    容器.appendChild(触发框)
    容器.appendChild(this.浮动面板)
    this.触发按钮 = 触发框

    触发框.onclick = (): void => {
      if (this.配置.禁用 === true) return
      this.安全执行(async (): Promise<void> => {
        if (this.展开状态 === true) await this.关闭面板()
        else this.打开面板(false)
      })
    }
    触发框.onkeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && this.展开状态 === true) {
        event.preventDefault()
        this.安全执行(async (): Promise<void> => await this.关闭面板())
        return
      }
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault()
        if (this.展开状态 === false) this.安全执行((): void => this.打开面板(true))
        else this.聚焦选项(0)
      }
    }
    this.浮动面板.onkeydown = (event: KeyboardEvent): void => {
      this.处理选项键盘(event)
    }

    let 失焦计时器: number | null = null
    let 失去焦点 = (): void => {
      if (失焦计时器 !== null) window.clearTimeout(失焦计时器)
      失焦计时器 = window.setTimeout((): void => {
        失焦计时器 = null
        let 当前焦点 = this.shadow.activeElement
        if (当前焦点 instanceof Node && 容器.contains(当前焦点) === true) return
        this.安全执行(async (): Promise<void> => await this.关闭面板())
        this.派发事件('失焦', undefined)
      })
    }
    容器.addEventListener('focusout', 失去焦点)
    this.注册清理((): void => {
      容器.removeEventListener('focusout', 失去焦点)
      if (失焦计时器 !== null) window.clearTimeout(失焦计时器)
    })
    this.注册清理(async (): Promise<void> => await this.关闭面板())

    this.shadow.appendChild(容器)
    this.渲染选项列表()
  }

  private 打开面板(聚焦首项: boolean): void {
    if (this.浮动面板 === undefined || this.触发按钮 === undefined || this.浮层句柄 !== null) return
    this.浮层句柄 = 浮层管理器.打开({
      根元素: this.浮动面板,
      内容元素: this.浮动面板,
      挂载方式: '原位弹出层',
      附加内部元素: [this.触发按钮],
      外部关闭: '任意外部',
      允许Escape关闭: true,
      位置更新: (): void => this.更新面板位置(),
      请求关闭: async (): Promise<void> => await this.关闭面板(),
    })
    this.展开状态 = true
    if (this.箭头 !== undefined) this.箭头.style.transform = 'rotate(180deg)'
    this.触发按钮.setAttribute('aria-expanded', 'true')
    this.派发事件('打开', undefined)
    this.更新面板位置()
    if (聚焦首项 === true && this.仍在展开状态() === true) {
      let 选中索引 = this.当前输入列表.findIndex((输入): boolean => 输入.checked)
      this.聚焦选项(选中索引 >= 0 ? 选中索引 : 0)
    }
  }

  private 仍在展开状态(): boolean {
    return this.展开状态
  }

  private async 关闭面板(): Promise<void> {
    this.展开状态 = false
    if (this.箭头 !== undefined) this.箭头.style.transform = 'rotate(0deg)'
    this.触发按钮?.setAttribute('aria-expanded', 'false')
    let 句柄 = this.浮层句柄
    this.浮层句柄 = null
    await 句柄?.关闭()
  }

  private 更新面板位置(): void {
    if (this.浮动面板 === undefined || this.触发按钮 === undefined) return
    let 边距 = 8
    let 间隔 = 4
    let 触发框矩形 = this.触发按钮.getBoundingClientRect()
    let 面板宽度 = Math.min(触发框矩形.width, window.innerWidth - 边距 * 2)
    this.浮动面板.style.width = `${Math.max(0, 面板宽度)}px`
    let 下方空间 = window.innerHeight - 触发框矩形.bottom - 间隔 - 边距
    let 上方空间 = 触发框矩形.top - 间隔 - 边距
    let 放在上方 = 下方空间 < Math.min(200, this.浮动面板.scrollHeight) && 上方空间 > 下方空间
    let 可用高度 = Math.max(80, Math.min(200, 放在上方 ? 上方空间 : 下方空间))
    this.浮动面板.style.maxHeight = `${可用高度}px`
    let 面板高度 = Math.min(this.浮动面板.scrollHeight, 可用高度)
    let 左 = Math.max(边距, Math.min(触发框矩形.left, window.innerWidth - 面板宽度 - 边距))
    let 上 = 放在上方 ? 触发框矩形.top - 面板高度 - 间隔 : 触发框矩形.bottom + 间隔
    this.浮动面板.style.left = `${左}px`
    this.浮动面板.style.top = `${Math.max(边距, 上)}px`
  }

  private 更新显示文本(): void {
    let 占位符文字 = this.配置.占位符 ?? '-- 点击选择 --'
    let 选中 = this.当前输入列表.filter((i) => i.checked)
    if (this.显示文本 !== undefined) {
      this.显示文本.textContent = 选中.length === 0 ? 占位符文字 : `已选 ${选中.length} 项`
    }
  }

  public 刷新列表(选项列表: 多选下拉框选项[]): void {
    let 原值 = this.获得值()
    this.配置.值 = 原值
    this.选项列表 = [...选项列表]
    this.渲染选项列表()
    let 新值 = this.获得值()
    this.配置.值 = 新值
    if (原值.length !== 新值.length || 原值.some((值, 索引): boolean => 值 !== 新值[索引])) this.派发事件('变化', 新值)
    if (this.展开状态 === true) this.更新面板位置()
  }

  private 渲染选项列表(): void {
    if (this.浮动面板 === undefined) return
    let 已选值 = new Set(this.配置.值 ?? [])
    this.浮动面板.replaceChildren()
    this.当前输入列表 = []
    this.当前选项元素列表 = []
    this.当前选中标记列表 = []
    for (let 选项 of this.选项列表) {
      let 行 = 创建元素('div', {
        role: 'option',
        tabIndex: -1,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--间距-2)',
          padding: 'var(--间距-1) var(--间距-3)',
          cursor: 'pointer',
        },
      })
      let input = 创建元素('input', {
        type: 'checkbox',
        value: 选项.value,
        disabled: this.配置.禁用 ?? false,
        tabIndex: -1,
        style: { display: 'none' },
      })
      input.setAttribute('aria-hidden', 'true')
      input.checked = 已选值.has(选项.value)
      行.setAttribute('aria-disabled', this.配置.禁用 === true ? 'true' : 'false')
      行.onpointerdown = (): void => 行.focus()
      let 选中标记 = 创建图标('check', 16)
      选中标记.style.flexShrink = '0'
      let text = 创建元素('span', {
        textContent: 选项.文字,
        style: { fontSize: 'var(--字号-正文)', color: 'var(--文字颜色)' },
      })
      行.appendChild(input)
      行.appendChild(选中标记)
      行.appendChild(text)
      this.同步选项外观(input, 行, 选中标记)
      行.onclick = (): void => {
        if (this.配置.禁用 === true) return
        this.切换选项(input, 行, 选中标记)
      }
      this.浮动面板.appendChild(行)
      this.当前输入列表.push(input)
      this.当前选项元素列表.push(行)
      this.当前选中标记列表.push(选中标记)
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
    for (let 索引 = 0; 索引 < this.当前输入列表.length; 索引 += 1) {
      let input = this.当前输入列表[索引]
      let 选项元素 = this.当前选项元素列表[索引]
      let 选中标记 = this.当前选中标记列表[索引]
      if (input === undefined || 选项元素 === undefined || 选中标记 === undefined) continue
      input.checked = 值.includes(input.value)
      this.同步选项外观(input, 选项元素, 选中标记)
    }
    this.更新显示文本()
  }

  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    if (this.触发按钮 !== undefined) {
      this.触发按钮.disabled = 值
      this.触发按钮.style.cursor = 值 ? 'not-allowed' : 'pointer'
    }
    for (let 输入 of this.当前输入列表) {
      输入.disabled = 值
      if (输入.parentElement instanceof HTMLDivElement) {
        输入.parentElement.style.cursor = 值 ? 'not-allowed' : 'pointer'
        输入.parentElement.setAttribute('aria-disabled', 值 ? 'true' : 'false')
      }
    }
    if (值 === true) this.安全执行(async (): Promise<void> => await this.关闭面板())
  }
  public 获得禁用(): boolean {
    return this.配置.禁用 ?? false
  }
  public 聚焦(): void {
    this.触发按钮?.focus()
  }
  public 设置可访问名称(名称: string): void {
    this.配置.可访问名称 = 名称
    this.触发按钮?.setAttribute('aria-label', 名称)
    this.浮动面板?.setAttribute('aria-label', `${名称}选项`)
  }
  public 设置校验状态(错误: string | null, 描述文本列表: string[]): void {
    if (this.触发按钮 !== undefined) 同步表单控件校验状态([this.触发按钮], 错误, 描述文本列表)
    同步表单控件校验状态(this.当前选项元素列表, 错误, 描述文本列表)
  }

  private 切换选项(输入: HTMLInputElement, 选项元素: HTMLDivElement, 选中标记: SVGSVGElement): void {
    输入.checked = 输入.checked === false
    this.同步选项外观(输入, 选项元素, 选中标记)
    this.更新显示文本()
    let 选中值 = this.获得值()
    this.配置.值 = 选中值
    this.派发事件('变化', 选中值)
  }

  private 处理选项键盘(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      this.安全执行(async (): Promise<void> => await this.关闭面板())
      this.触发按钮?.focus()
      return
    }
    let 当前索引 = this.当前选项元素列表.findIndex((元素): boolean => 元素 === this.shadow.activeElement)
    if (当前索引 < 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      let 最后索引 = this.当前选项元素列表.length - 1
      let 目标索引 = 当前索引
      if (event.key === 'ArrowDown') 目标索引 = 当前索引 >= 最后索引 ? 0 : 当前索引 + 1
      else if (event.key === 'ArrowUp') 目标索引 = 当前索引 <= 0 ? 最后索引 : 当前索引 - 1
      else if (event.key === 'Home') 目标索引 = 0
      else 目标索引 = 最后索引
      this.聚焦选项(目标索引)
      return
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      let 输入 = this.当前输入列表[当前索引]
      let 选项元素 = this.当前选项元素列表[当前索引]
      let 选中标记 = this.当前选中标记列表[当前索引]
      if (输入 !== undefined && 选项元素 !== undefined && 选中标记 !== undefined)
        this.切换选项(输入, 选项元素, 选中标记)
    }
  }

  private 同步选项外观(输入: HTMLInputElement, 选项元素: HTMLDivElement, 选中标记: SVGSVGElement): void {
    选项元素.setAttribute('aria-selected', 输入.checked ? 'true' : 'false')
    选项元素.style.backgroundColor = 输入.checked ? 'var(--主色调-极淡)' : 'transparent'
    选中标记.style.color = 'var(--主色调)'
    选中标记.style.opacity = 输入.checked ? '1' : '0'
  }

  private 聚焦选项(索引: number): void {
    this.当前选项元素列表[索引]?.focus()
  }
}

多选下拉框.注册组件('lsby-form-multi-select', 多选下拉框)
