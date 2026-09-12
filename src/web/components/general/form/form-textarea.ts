import { 增强样式类型 } from '../../../../web/global/types/style'
import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'
import { 获得表单控件基础样式 } from './control-style'
import { 同步表单控件校验状态, 表单组件基类 } from './form'

type 事件类型 = { 输入: string; 变化: string; 焦点: void; 失焦: void; 提交: string }
type 监听事件类型 = {}

export type 自动伸缩文本框配置 = {
  占位符?: string
  值?: string
  禁用?: boolean
  最大高度?: string
  最小高度?: string
  回车提交?: boolean
  自动伸缩?: boolean
  额外提示?: string
  宿主样式?: 增强样式类型
  可访问名称?: string
}

export class 自动伸缩文本框 extends 表单组件基类<事件类型, 监听事件类型, string> {
  static {
    this.注册组件('lsby-form-auto-scaling-textarea', this)
  }

  private 配置: 自动伸缩文本框配置
  private 文本框元素: HTMLTextAreaElement | undefined
  private 自适应动画帧: number | null = null

  public constructor(配置: 自动伸缩文本框配置 = {}) {
    super()
    this.配置 = { 回车提交: true, 自动伸缩: true, 最小高度: '40px', ...配置 }
  }

  protected override async 当加载时(): Promise<void> {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)

    this.文本框元素 = 创建元素('textarea', {
      placeholder: this.配置.占位符 ?? '',
      rows: 1,
      style: {
        ...获得表单控件基础样式({
          禁用: this.配置.禁用 ?? false,
          光标: 'text',
          高度: this.配置.自动伸缩 === true ? 'auto' : '100%',
        }),
        padding: 'var(--间距-2) var(--间距-3)',
        resize: this.配置.自动伸缩 === true ? 'none' : 'vertical',
        minHeight: this.配置.最小高度,
        maxHeight: this.配置.自动伸缩 === true ? (this.配置.最大高度 ?? '200px') : (this.配置.最大高度 ?? 'none'),
        overflowY: this.配置.自动伸缩 === true ? 'hidden' : 'auto',
        lineHeight: '1.5',
        display: 'block',
      },
      oninput: (): void => {
        if (this.文本框元素 !== undefined) this.配置.值 = this.文本框元素.value
        if (this.配置.自动伸缩 === true) {
          this.自适应高度()
        }
        this.派发事件('输入', this.获得值())
      },
      onchange: (): void => {
        let 值 = this.获得值()
        this.配置.值 = 值
        this.派发事件('变化', 值)
      },
      onkeydown: (e: KeyboardEvent): void => {
        if (this.配置.回车提交 === true && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault()
          let 值 = this.获得值()
          if (值.trim() !== '') {
            this.派发事件('提交', 值)
          }
        }
      },
      onfocus: (): void => {
        if (this.文本框元素 !== undefined) {
          this.文本框元素.style.borderColor = 'var(--主色调)'
          this.文本框元素.style.boxShadow = 'var(--聚焦环)'
        }
        this.派发事件('焦点', undefined)
      },
      onblur: (): void => {
        if (this.文本框元素 !== undefined) {
          this.文本框元素.style.borderColor = 'var(--边框颜色)'
          this.文本框元素.style.boxShadow = 'none'
        }
        this.派发事件('失焦', undefined)
      },
    })
    if (this.配置.可访问名称 !== undefined) this.文本框元素.setAttribute('aria-label', this.配置.可访问名称)
    this.文本框元素.disabled = this.配置.禁用 ?? false

    if (this.配置.值 !== undefined) {
      this.文本框元素.value = this.配置.值
    }

    let 包装容器 = 创建元素('div', {
      style: { display: 'flex', alignItems: 'flex-start', width: '100%', gap: 'var(--间距-1)' },
    })
    包装容器.appendChild(this.文本框元素)

    if (this.配置.额外提示 !== undefined) {
      let 提示图标 = this.创建提示图标(this.配置.额外提示)
      提示图标.style.marginTop = 'var(--间距-2)'
      包装容器.appendChild(提示图标)
    }

    this.shadow.append(包装容器)
    if (this.配置.自动伸缩 === true) {
      this.自适应高度()

      // 监听大小变化（例如容器显示/隐藏、窗口缩放等）
      let observer = new ResizeObserver(() => {
        this.自适应高度()
      })
      observer.observe(this.文本框元素)
      this.注册观察器(observer)
    }
    this.注册清理((): void => {
      if (this.自适应动画帧 !== null) cancelAnimationFrame(this.自适应动画帧)
      this.自适应动画帧 = null
    })
  }

  private 自适应高度(): void {
    let 元素 = this.文本框元素
    if (元素 === undefined) return

    // 立即尝试计算一次
    this.执行自适应高度(元素)

    // 在下一帧再次计算，确保浏览器已完成布局
    if (this.自适应动画帧 !== null) cancelAnimationFrame(this.自适应动画帧)
    this.自适应动画帧 = requestAnimationFrame(() => {
      this.自适应动画帧 = null
      this.执行自适应高度(元素)
    })
  }

  private 执行自适应高度(元素: HTMLTextAreaElement): void {
    let 原始高度 = 元素.style.height
    元素.style.height = 'auto'
    let scrollHeight = 元素.scrollHeight

    if (scrollHeight === 0) {
      元素.style.height = 原始高度
      return
    }

    let 计算样式最大高度 = getComputedStyle(元素).maxHeight
    let 最大高度 = 计算样式最大高度 === 'none' ? Number.POSITIVE_INFINITY : Number.parseFloat(计算样式最大高度)
    let targetHeight = Math.min(scrollHeight + 2, Number.isFinite(最大高度) ? 最大高度 : scrollHeight + 2)
    let 目标高度 = `${targetHeight}px`

    // 只有当高度确实需要变化时才进行设置，减少 resize 触发的可能性
    if (目标高度 !== 原始高度) {
      元素.style.height = 目标高度
      if (scrollHeight + 2 <= 最大高度) {
        元素.style.overflowY = 'hidden'
      } else {
        元素.style.overflowY = 'auto'
      }
    } else {
      元素.style.height = 原始高度
    }
  }

  public 获得值(): string {
    return this.文本框元素?.value ?? this.配置.值 ?? ''
  }

  public 设置值(值: string): void {
    this.配置.值 = 值
    if (this.文本框元素 !== undefined) {
      this.文本框元素.value = 值
      if (this.配置.自动伸缩 === true) {
        this.自适应高度()
      }
    }
  }

  public 设置占位符(占位符: string): void {
    this.配置.占位符 = 占位符
    if (this.文本框元素 !== undefined) {
      this.文本框元素.placeholder = 占位符
    }
  }

  public 设置禁用(禁用: boolean): void {
    this.配置.禁用 = 禁用
    if (this.文本框元素 !== undefined) {
      this.文本框元素.disabled = 禁用
      this.文本框元素.style.opacity = 禁用 ? '0.6' : '1'
      this.文本框元素.style.cursor = 禁用 ? 'not-allowed' : 'text'
      this.文本框元素.style.backgroundColor = 禁用 ? 'var(--禁用背景)' : 'var(--输入框背景)'
    }
  }

  public 获得禁用(): boolean {
    return this.配置.禁用 ?? false
  }

  public 设置可访问名称(名称: string): void {
    this.配置.可访问名称 = 名称
    this.文本框元素?.setAttribute('aria-label', 名称)
  }

  public 设置校验状态(错误: string | null, 描述文本列表: string[]): void {
    if (this.文本框元素 !== undefined) 同步表单控件校验状态([this.文本框元素], 错误, 描述文本列表)
  }

  public 聚焦(): void {
    this.文本框元素?.focus()
  }
}
