import { 组件基类 } from '../../../base/base'
import { 是中止错误 } from '../../../global/tools/abort'
import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'
import { 格式化文件大小 } from '../../../global/tools/format-file-size'
import { 增强样式类型 } from '../../../global/types/style'
import { 主要按钮, 文本按钮 } from '../base/base-button'
import { 提示条组件 } from '../base/feedback'
import { 创建图标 } from '../base/icon'
import { 文件匹配接受类型 } from './file-utils'

export type 文件上传上下文 = { 信号: AbortSignal; 报告进度: (百分比: number) => void }
export type 文件上传命令 = (文件列表: readonly File[], 上下文: 文件上传上下文) => Promise<void>
export type 文件选择器配置 = {
  允许多选?: boolean
  接受类型?: string
  最大文件数?: number
  单文件最大字节?: number
  禁用?: boolean
  提示文本?: string
  上传命令?: 文件上传命令
  上传按钮文本?: string
  宿主样式?: 增强样式类型
}
type 文件选择器事件 = {
  变化: { 文件列表: readonly File[] }
  校验失败: { 消息: string }
  上传开始: { 文件列表: readonly File[] }
  上传进度: { 百分比: number }
  上传取消: { 文件列表: readonly File[] }
  上传完成: { 文件列表: readonly File[] }
  上传失败: { 错误: unknown }
}

export class 文件选择器 extends 组件基类<文件选择器事件, {}> {
  static {
    this.注册组件('lsby-file-picker', this)
  }

  private 配置: 文件选择器配置
  private 文件列表: File[] = []
  private 原生输入?: HTMLInputElement
  private 拖拽区?: HTMLButtonElement
  private 列表容器?: HTMLDivElement
  private 消息容器?: HTMLDivElement
  private 进度容器?: HTMLDivElement
  private 进度条?: HTMLDivElement
  private 上传按钮?: 主要按钮
  private 清空按钮?: 文本按钮
  private 取消按钮?: 文本按钮
  private 上传控制器: AbortController | null = null

  public constructor(配置: 文件选择器配置 = {}) {
    super()
    this.配置 = 配置
  }

  protected override 当加载时(): void {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)
    let 容器 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--间距-3)' } })
    let 原生输入 = 创建元素('input', {
      type: 'file',
      multiple: this.配置.允许多选 ?? false,
      disabled: this.配置.禁用 ?? false,
      style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' },
    })
    if (this.配置.接受类型 !== undefined) 原生输入.accept = this.配置.接受类型
    原生输入.setAttribute('aria-label', '选择待上传文件')
    let 拖拽区 = 创建元素('button', {
      type: 'button',
      disabled: this.配置.禁用 ?? false,
      style: {
        width: '100%',
        minHeight: '132px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--间距-2)',
        border: '2px dashed var(--边框颜色)',
        borderRadius: 'var(--圆角-大)',
        backgroundColor: 'var(--次要背景颜色)',
        color: 'var(--文字颜色)',
        cursor: this.配置.禁用 === true ? 'not-allowed' : 'pointer',
      },
    })
    let 图标 = 创建图标('upload-cloud', 32)
    图标.style.color = 'var(--主色调)'
    拖拽区.append(图标, 创建元素('strong', { textContent: '选择或拖拽文件' }))
    if (this.配置.提示文本 !== undefined)
      拖拽区.append(创建元素('span', { textContent: this.配置.提示文本, style: { color: 'var(--次要文字颜色)' } }))
    let 列表容器 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--间距-2)' } })
    let 消息容器 = 创建元素('div')
    let { 进度容器, 进度条 } = this.创建进度()
    let 操作区 = this.创建操作区()
    原生输入.onchange = (): void => {
      this.追加文件(this.转换文件列表(原生输入.files))
      原生输入.value = ''
    }
    this.绑定拖拽事件(拖拽区, 原生输入)
    this.原生输入 = 原生输入
    this.拖拽区 = 拖拽区
    this.列表容器 = 列表容器
    this.消息容器 = 消息容器
    this.进度容器 = 进度容器
    this.进度条 = 进度条
    容器.append(原生输入, 拖拽区, 列表容器, 进度容器, 操作区, 消息容器)
    this.shadow.append(容器)
    this.更新视图()
    this.注册清理((): void => this.取消上传())
  }

  public 获得文件列表(): readonly File[] {
    return [...this.文件列表]
  }

  public 清空(): void {
    if (this.上传控制器 !== null) return
    this.文件列表 = []
    this.更新视图()
    this.派发事件('变化', { 文件列表: [] })
  }

  public async 上传(): Promise<void> {
    if (this.配置.上传命令 === undefined || this.文件列表.length === 0 || this.上传控制器 !== null) return
    let 文件快照 = [...this.文件列表]
    let 控制器 = new AbortController()
    this.上传控制器 = 控制器
    this.更新视图()
    this.更新进度(0)
    this.派发事件('上传开始', { 文件列表: 文件快照 })
    try {
      await this.配置.上传命令(文件快照, {
        信号: 控制器.signal,
        报告进度: (百分比: number): void => this.更新进度(百分比),
      })
      if (控制器.signal.aborted === true) return
      this.更新进度(100)
      this.显示消息(new 提示条组件({ 内容: '文件上传完成', 类型: '成功' }))
      this.派发事件('上传完成', { 文件列表: 文件快照 })
    } catch (错误) {
      if (是中止错误(错误, 控制器.signal) === true || 控制器.signal.aborted === true) {
        this.显示消息(new 提示条组件({ 内容: '文件上传已取消', 类型: '信息' }))
        this.派发事件('上传取消', { 文件列表: 文件快照 })
        return
      }
      this.显示消息(
        new 提示条组件({ 内容: `文件上传失败：${错误 instanceof Error ? 错误.message : String(错误)}`, 类型: '错误' }),
      )
      this.派发事件('上传失败', { 错误 })
    } finally {
      if (this.上传控制器 === 控制器) this.上传控制器 = null
      this.更新视图()
    }
  }

  public 取消上传(): void {
    this.上传控制器?.abort()
    this.上传控制器 = null
    this.更新视图()
  }

  public 设置禁用(值: boolean): void {
    this.配置.禁用 = 值
    this.更新视图()
  }

  private 创建操作区(): HTMLDivElement {
    let 容器 = 创建元素('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--间距-2)' } })
    this.清空按钮 = new 文本按钮({ 文本: '清空', 自动加载: false, 点击处理函数: (): void => this.清空() })
    this.取消按钮 = new 文本按钮({ 文本: '取消上传', 自动加载: false, 点击处理函数: (): void => this.取消上传() })
    容器.append(this.清空按钮, this.取消按钮)
    if (this.配置.上传命令 !== undefined) {
      this.上传按钮 = new 主要按钮({
        文本: this.配置.上传按钮文本 ?? '开始上传',
        自动加载: false,
        点击处理函数: async (): Promise<void> => await this.上传(),
      })
      容器.append(this.上传按钮)
    }
    return 容器
  }

  private 创建进度(): { 进度容器: HTMLDivElement; 进度条: HTMLDivElement } {
    let 进度条 = 创建元素('div', {
      style: { width: '0%', height: '100%', backgroundColor: 'var(--主色调)', transition: 'width var(--动画-快)' },
    })
    let 进度容器 = 创建元素('div', {
      role: 'progressbar',
      hidden: true,
      style: { height: '8px', overflow: 'hidden', borderRadius: '999px', backgroundColor: 'var(--次要背景颜色)' },
    })
    进度容器.setAttribute('aria-valuemin', '0')
    进度容器.setAttribute('aria-valuemax', '100')
    进度容器.append(进度条)
    return { 进度容器, 进度条 }
  }

  private 绑定拖拽事件(拖拽区: HTMLButtonElement, 原生输入: HTMLInputElement): void {
    拖拽区.onclick = (): void => 原生输入.click()
    拖拽区.ondragover = (event: DragEvent): void => {
      event.preventDefault()
      if (this.配置.禁用 !== true && this.上传控制器 === null) 拖拽区.style.borderColor = 'var(--主色调)'
    }
    拖拽区.ondragleave = (): void => {
      拖拽区.style.borderColor = 'var(--边框颜色)'
    }
    拖拽区.ondrop = (event: DragEvent): void => {
      event.preventDefault()
      拖拽区.style.borderColor = 'var(--边框颜色)'
      if (this.配置.禁用 !== true && this.上传控制器 === null)
        this.追加文件(this.转换文件列表(event.dataTransfer?.files ?? null))
    }
  }

  private 追加文件(新文件列表: readonly File[]): void {
    let 结果 = this.配置.允许多选 === true ? [...this.文件列表] : []
    for (let 文件 of 新文件列表) {
      let 错误 = this.校验文件(文件, 结果.length)
      if (错误 !== null) {
        this.显示校验失败(错误)
        continue
      }
      if (结果.some((已有文件): boolean => 已有文件.name === 文件.name && 已有文件.size === 文件.size) === false)
        结果.push(文件)
    }
    this.文件列表 = 结果
    this.更新视图()
    this.派发事件('变化', { 文件列表: this.获得文件列表() })
  }

  private 校验文件(文件: File, 当前数量: number): string | null {
    if (文件匹配接受类型(文件, this.配置.接受类型) === false) return `文件 ${文件.name} 类型不符合要求`
    if (this.配置.单文件最大字节 !== undefined && 文件.size > this.配置.单文件最大字节)
      return `文件 ${文件.name} 超过 ${格式化文件大小(this.配置.单文件最大字节)}`
    if (this.配置.最大文件数 !== undefined && 当前数量 >= this.配置.最大文件数)
      return `最多选择 ${this.配置.最大文件数} 个文件`
    return null
  }

  private 更新视图(): void {
    let 正在上传 = this.上传控制器 !== null
    let 禁用 = this.配置.禁用 === true || 正在上传
    if (this.原生输入 !== undefined) this.原生输入.disabled = 禁用
    if (this.拖拽区 !== undefined) {
      this.拖拽区.disabled = 禁用
      this.拖拽区.style.cursor = 禁用 ? 'not-allowed' : 'pointer'
    }
    this.清空按钮?.设置禁用(禁用 || this.文件列表.length === 0)
    this.取消按钮?.设置禁用(正在上传 === false)
    this.上传按钮?.设置禁用(禁用 || this.文件列表.length === 0)
    this.渲染文件列表()
  }

  private 渲染文件列表(): void {
    if (this.列表容器 === undefined) return
    this.列表容器.replaceChildren()
    this.文件列表.forEach((文件, 索引): void => {
      let 行 = 创建元素('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--间距-2)',
          padding: 'var(--间距-2)',
          border: '1px solid var(--边框颜色)',
          borderRadius: 'var(--圆角-中)',
        },
      })
      行.append(
        创建图标('file', 18),
        创建元素('span', {
          textContent: 文件.name,
          style: { minWidth: '0', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis' },
        }),
        创建元素('span', { textContent: 格式化文件大小(文件.size), style: { color: 'var(--次要文字颜色)' } }),
      )
      行.append(
        new 文本按钮({
          文本: '移除',
          标题: `移除文件 ${文件.name}`,
          禁用: this.上传控制器 !== null,
          自动加载: false,
          点击处理函数: (): void => this.移除文件(索引),
        }),
      )
      this.列表容器?.append(行)
    })
  }

  private 移除文件(索引: number): void {
    if (this.上传控制器 !== null || this.文件列表[索引] === undefined) return
    this.文件列表.splice(索引, 1)
    this.更新视图()
    this.派发事件('变化', { 文件列表: this.获得文件列表() })
  }

  private 更新进度(百分比: number): void {
    let 安全值 = Math.min(100, Math.max(0, 百分比))
    if (this.进度容器 !== undefined) {
      this.进度容器.hidden = false
      this.进度容器.setAttribute('aria-valuenow', String(安全值))
    }
    if (this.进度条 !== undefined) this.进度条.style.width = `${安全值}%`
    this.派发事件('上传进度', { 百分比: 安全值 })
  }

  private 显示校验失败(消息: string): void {
    this.显示消息(new 提示条组件({ 内容: 消息, 类型: '错误' }))
    this.派发事件('校验失败', { 消息 })
  }

  private 显示消息(消息: 提示条组件): void {
    this.消息容器?.replaceChildren(消息)
  }

  private 转换文件列表(文件列表: FileList | null): File[] {
    if (文件列表 === null) return []
    let 结果: File[] = []
    for (let 索引 = 0; 索引 < 文件列表.length; 索引 += 1) {
      let 文件 = 文件列表.item(索引)
      if (文件 !== null) 结果.push(文件)
    }
    return 结果
  }
}
