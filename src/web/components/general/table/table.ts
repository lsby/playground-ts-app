import { 增强样式类型 } from '../../../../web/global/types/style'
import { 组件基类, 要求组件构造参数 } from '../../../base/base'
import { 右键菜单管理器 } from '../../../global/manager/context-menu-manager'
import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'
import { 普通按钮 } from '../base/base-button'
import { 创建图标 } from '../base/icon'
import { 分页组件, 数据表分页配置 } from '../pagination/pagination'
import { 渲染表体, 渲染表头, 渲染顶部操作区, 表格渲染上下文 } from './render-helper'
import { 表格选择管理器 } from './selection-handler'
import {
  发出事件类型,
  数据表列配置,
  数据表加载数据参数,
  数据表操作配置,
  数据表格选项,
  数据表行键,
  监听事件类型,
  顶部操作配置,
} from './types'

export class 表格组件<数据项> extends 组件基类<发出事件类型<数据项>, 监听事件类型> {
  static {
    this.注册组件('lsby-table', this)
  }

  private 行键回调: (数据项: 数据项, 索引: number) => 数据表行键
  private 列配置: 数据表列配置<数据项>[]
  private 操作列表: 数据表操作配置<数据项>[]
  private 顶部操作列表: 顶部操作配置[]
  private 加载数据回调: (参数: 数据表加载数据参数<数据项>) => Promise<{ 数据: 数据项[]; 总数: number }>
  private 数据列表: 数据项[] = []
  private 分页配置: 数据表分页配置
  private 排序列表: { field: keyof 数据项; direction: 'asc' | 'desc' }[] = []
  private 筛选条件: Record<string, string> = {}
  private 加载中 = false
  private 加载错误: string | null = null
  private 请求代次 = 0
  private 请求控制器 = new AbortController()
  private 拖动列索引 = -1
  private 拖动起始X = 0
  private 拖动起始宽度 = 0
  private 列最小宽度: string
  private 列最大宽度: string | undefined
  private 可访问名称: string
  private 宿主样式: 增强样式类型 | undefined
  private 表格行元素映射 = new Map<数据表行键, HTMLTableRowElement>()
  private 表格单元格元素映射 = new Map<string, HTMLTableCellElement>()
  private 表头元素映射 = new Map<number, HTMLElement>()
  private 列单元格映射 = new Map<number, HTMLElement[]>()
  private 选择管理器: 表格选择管理器<数据项>

  public constructor(选项: 数据表格选项<数据项>) {
    super()
    let 有效选项 = 要求组件构造参数(选项, '表格组件')
    this.行键回调 = 有效选项.行键
    this.列配置 = 有效选项.列配置
    this.操作列表 = 有效选项.操作列表 ?? []
    this.顶部操作列表 = 有效选项.顶部操作列表 ?? []
    this.加载数据回调 = 有效选项.加载数据
    this.列最小宽度 = 有效选项.列最小宽度 ?? '80px'
    this.列最大宽度 = 有效选项.列最大宽度
    this.可访问名称 = 有效选项.可访问名称 ?? '数据表格'
    this.宿主样式 = 有效选项.宿主样式
    this.分页配置 = { 当前页码: 1, 每页数量: 有效选项.每页数量 ?? 10, 总数量: 0 }
    this.选择管理器 = new 表格选择管理器({
      数据列表: this.数据列表,
      列配置: this.列配置,
      获得行键: (行索引): 数据表行键 | undefined => this.获得行键(行索引),
      表格行元素映射: this.表格行元素映射,
      表格单元格元素映射: this.表格单元格元素映射,
    })
  }

  public 获得当前页码(): number {
    return this.分页配置.当前页码
  }
  public 获得每页数量(): number {
    return this.分页配置.每页数量
  }
  public async 刷新数据(): Promise<void> {
    await this.加载数据()
  }

  protected override async 当加载时(): Promise<void> {
    应用宿主样式(this.获得宿主样式(), this.宿主样式)
    await this.加载数据()
  }

  protected override 当卸载时(): void {
    this.请求代次 += 1
    this.请求控制器.abort()
  }

  private async 加载数据(): Promise<void> {
    this.请求代次 += 1
    let 本次代次 = this.请求代次
    this.请求控制器.abort()
    this.请求控制器 = new AbortController()
    this.加载中 = true
    this.加载错误 = null
    void 右键菜单管理器.获得实例().隐藏菜单()
    this.派发事件('加载状态变化', { 加载中: true, 错误: null })
    this.渲染()
    try {
      let 结果 = await this.请求当前页(this.请求控制器.signal)
      if (本次代次 !== this.请求代次 || this.请求控制器.signal.aborted === true) return
      this.分页配置.总数量 = 结果.总数
      let 总页数 = Math.max(1, Math.ceil(结果.总数 / this.分页配置.每页数量))
      if (this.分页配置.当前页码 > 总页数) {
        this.分页配置.当前页码 = 总页数
        结果 = await this.请求当前页(this.请求控制器.signal)
        if (本次代次 !== this.请求代次) return
        this.分页配置.总数量 = 结果.总数
      }
      this.验证行键(结果.数据)
      this.数据列表.splice(0, this.数据列表.length, ...结果.数据)
      this.选择管理器.移除已不存在的选择()
    } catch (错误) {
      if (this.请求控制器.signal.aborted === false && 本次代次 === this.请求代次)
        this.加载错误 = 错误 instanceof Error ? 错误.message : String(错误)
    } finally {
      if (本次代次 === this.请求代次 && this.请求控制器.signal.aborted === false && this.isConnected === true) {
        this.加载中 = false
        this.渲染()
        this.派发事件('加载状态变化', { 加载中: false, 错误: this.加载错误 })
      }
    }
  }

  private 请求当前页(信号: AbortSignal): Promise<{ 数据: 数据项[]; 总数: number }> {
    return this.加载数据回调({
      页码: this.分页配置.当前页码,
      每页数量: this.分页配置.每页数量,
      排序列表: [...this.排序列表],
      筛选条件: { ...this.筛选条件 },
      信号,
    })
  }

  private 渲染(): void {
    this.表格行元素映射.clear()
    this.表格单元格元素映射.clear()
    this.表头元素映射.clear()
    this.列单元格映射.clear()
    let 容器 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--间距-3)' } })
    let 操作列宽度 = this.操作列表.map((操作) => Math.max(88, 操作.名称.length * 16 + 40))
    let 上下文 = this.创建渲染上下文()
    let 顶部 = 渲染顶部操作区(上下文)
    if (顶部 !== null) 容器.append(顶部)
    if (this.加载中 === true)
      容器.append(
        创建元素('div', { role: 'status', textContent: '正在加载…', style: { color: 'var(--次要文字颜色)' } }),
      )
    if (this.加载错误 !== null) {
      let 错误区 = 创建元素('div', {
        role: 'alert',
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--间距-3)',
          padding: 'var(--间距-3)',
          color: 'var(--错误颜色)',
          backgroundColor: 'color-mix(in srgb, var(--错误颜色) 10%, transparent)',
          borderRadius: 'var(--圆角-中)',
        },
      })
      错误区.append(
        创建元素('span', { textContent: `加载失败：${this.加载错误}` }),
        new 普通按钮({ 文本: '重试', 尺寸: '紧凑', 点击处理函数: async (): Promise<void> => await this.加载数据() }),
      )
      容器.append(错误区)
    }
    let 表格包装 = 创建元素('div', {
      style: { width: '100%', overflowX: 'auto', border: '1px solid var(--边框颜色)', borderRadius: 'var(--圆角-中)' },
    })
    let 表格 = 创建元素('table', { style: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' } })
    表格.setAttribute('aria-label', this.可访问名称)
    表格.setAttribute('aria-busy', this.加载中 ? 'true' : 'false')
    表格.append(渲染表头(上下文, 操作列宽度), 渲染表体(上下文, 操作列宽度))
    表格包装.append(表格)
    容器.append(表格包装)
    let 分页 = new 分页组件(this.分页配置, this.加载中)
    分页.on页码变化 = async (数据): Promise<void> => {
      this.分页配置.当前页码 = 数据.页码
      this.派发事件('页码变化', 数据)
      await this.加载数据()
    }
    容器.append(分页)
    this.清空影子dom()
    this.shadow.append(容器)
  }

  private 创建渲染上下文(): 表格渲染上下文<数据项> {
    let 上下文: 表格渲染上下文<数据项> = {
      列配置: this.列配置,
      数据列表: this.数据列表,
      获得行键: (索引) => this.获得行键(索引),
      操作列表: this.操作列表,
      顶部操作列表: this.顶部操作列表,
      筛选条件: this.筛选条件,
      排序列表: this.排序列表,
      选中行键: this.选择管理器.获得选中行键(),
      最后单元格: this.选择管理器.获得最后点击的单元格(),
      多选模式: this.选择管理器.获得是否为多选模式(),
      列最小宽度: this.列最小宽度,
      表格行元素映射: this.表格行元素映射,
      表格单元格元素映射: this.表格单元格元素映射,
      表头元素映射: this.表头元素映射,
      列单元格映射: this.列单元格映射,
      加载数据: async () => await this.加载数据(),
      刷新数据: async () => await this.刷新数据(),
      处理行点击: (行, ctrl, shift) => this.选择管理器.处理行点击(行, ctrl, shift),
      处理单元格点击: (行, 列, ctrl, shift) => this.选择管理器.处理单元格点击(行, 列, ctrl, shift),
      更新选中状态: () => this.选择管理器.更新选中状态(),
      派发操作点击: (操作名, 数据项): void => {
        this.派发事件('操作点击', { 操作名, 数据项 })
      },
      显示右键菜单: (x, y) => this.显示右键菜单(x, y),
      开始调整列宽: (列, event, th, 调整柄) => this.开始调整列宽(列, event, th, 调整柄),
      键盘调整列宽: (列, 变化量, th) => this.键盘调整列宽(列, 变化量, th),
    }
    if (this.列最大宽度 !== undefined) 上下文.列最大宽度 = this.列最大宽度
    return 上下文
  }

  private 显示右键菜单(x: number, y: number): void {
    右键菜单管理器
      .获得实例()
      .显示菜单(x, y, [
        {
          文本: '复制',
          图标: 创建图标('copy', 14),
          回调: async (): Promise<void> => await this.选择管理器.复制选中内容(),
        },
      ])
  }
  private 获得行键(索引: number): 数据表行键 | undefined {
    let 数据 = this.数据列表[索引]
    return 数据 === undefined ? undefined : this.行键回调(数据, 索引)
  }
  private 验证行键(数据们: 数据项[]): void {
    let 键们 = new Set<数据表行键>()
    for (let 索引 = 0; 索引 < 数据们.length; 索引 += 1) {
      let 数据 = 数据们[索引]
      if (数据 === undefined) continue
      let 键 = this.行键回调(数据, 索引)
      if (键们.has(键)) throw new Error(`表格行键重复: ${String(键)}`)
      键们.add(键)
    }
  }
  private 开始调整列宽(列索引: number, event: PointerEvent, 表头: HTMLElement, 调整柄: HTMLElement): void {
    event.preventDefault()
    this.拖动列索引 = 列索引
    this.拖动起始X = event.clientX
    this.拖动起始宽度 = 表头.offsetWidth
    调整柄.setPointerCapture(event.pointerId)
    调整柄.onpointermove = (移动事件: PointerEvent): void => {
      if (调整柄.hasPointerCapture(移动事件.pointerId) === false || this.拖动列索引 < 0) return
      let 新宽度 = this.拖动起始宽度 + 移动事件.clientX - this.拖动起始X
      this.应用列宽(this.拖动列索引, 新宽度)
    }
    let 结束调整 = (结束事件: PointerEvent): void => {
      if (调整柄.hasPointerCapture(结束事件.pointerId) === true) 调整柄.releasePointerCapture(结束事件.pointerId)
      this.拖动列索引 = -1
      调整柄.onpointermove = null
      调整柄.onpointerup = null
      调整柄.onpointercancel = null
    }
    调整柄.onpointerup = 结束调整
    调整柄.onpointercancel = 结束调整
  }
  private 键盘调整列宽(列索引: number, 变化量: number, 表头: HTMLElement): void {
    this.应用列宽(列索引, 表头.offsetWidth + 变化量)
  }
  private 应用列宽(列索引: number, 宽度: number): void {
    let 新宽度 = Math.max(50, 宽度)
    let 元素们 = [this.表头元素映射.get(列索引), ...(this.列单元格映射.get(列索引) ?? [])]
    for (let 元素 of 元素们) {
      if (元素 === undefined) continue
      元素.style.width = `${新宽度}px`
      元素.style.minWidth = `${新宽度}px`
      元素.style.maxWidth = `${新宽度}px`
    }
  }
}
