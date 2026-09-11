import { 组件基类 } from '../../../base/base'
import { 创建元素 } from '../../../global/tools/create-element'
import { 创建标签页标识前缀, 同步标签页路由, type 标签方向, 计算键盘目标索引, 读取标签页索引 } from './tabs-common'

type App导航配置 = { 路由键?: string | undefined }
export type appNavigation发出事件类型 = { 切换: { 当前索引: number } }
type 监听事件类型 = {}

type 标签页项 = {
  标签: string
  图标?: string | undefined
  标识?: string | undefined
  内容: HTMLElement
  已挂载: boolean
}

/**
 * 页面采用首次访问懒挂载：添加页面时内容实例已经创建，但不会立即连接 DOM；
 * 初始化时只挂载当前页面，其他页面在首次访问时才挂载，访问过的页面会保留 DOM 和页面状态。
 *
 * 页面组件的构造函数只应用于初始化字段和创建不会产生副作用的对象。网络请求、定时器、
 * WebSocket、观察器及依赖 DOM 的事件监听应放在 `当加载时` 中，并通过 `注册清理` 或
 * `当卸载时` 释放。构造函数中的副作用会在未访问页面时提前执行，从而绕过懒挂载机制。
 * `当加载时` 可能因刷新或重新连接再次执行，因此其中的逻辑还应保持可重复执行。
 */
export class App导航组件 extends 组件基类<appNavigation发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-app-navigation', this)
  }

  private 配置: App导航配置
  private 当前索引: number = 0
  private 导航栏容器: HTMLDivElement = 创建元素('div')
  private 内容容器: HTMLDivElement = 创建元素('div')
  private 是移动端: boolean = false
  private 标签页列表: 标签页项[] = []
  private 标签按钮列表: HTMLButtonElement[] = []
  private readonly 标签页标识前缀 = 创建标签页标识前缀()

  public constructor(配置: App导航配置 = {}) {
    super()
    this.配置 = 配置
  }

  public 添加标签页(
    配置: { 标签: string; 图标?: string | undefined; 标识?: string | undefined },
    内容: HTMLElement,
  ): void {
    this.标签页列表.push({ 标签: 配置.标签, 图标: 配置.图标, 标识: 配置.标识, 内容, 已挂载: false })
  }

  protected override async 当加载时(): Promise<void> {
    this.当前索引 = 读取标签页索引(this.配置.路由键, this.标签页列表, this.当前索引)

    let 移动端查询 = window.matchMedia('(max-width: 768px)')
    this.是移动端 = 移动端查询.matches
    let 处理布局变化 = (事件: MediaQueryListEvent): void => {
      this.是移动端 = 事件.matches
      this.更新布局()
    }
    移动端查询.addEventListener('change', 处理布局变化)
    this.注册清理((): void => 移动端查询.removeEventListener('change', 处理布局变化))

    this.初始化结构()
    this.确保标签页已挂载(this.当前索引)
    this.更新布局()
    this.更新UI()
  }

  private 初始化结构(): void {
    let style = this.获得宿主样式()
    style.display = 'flex'
    style.width = '100%'
    style.height = '100%'
    style.overflow = 'hidden'

    this.导航栏容器.style.display = 'flex'
    this.导航栏容器.style.backgroundColor = 'var(--背景颜色)'
    this.导航栏容器.style.zIndex = '10'
    this.导航栏容器.setAttribute('role', 'navigation')
    this.导航栏容器.setAttribute('aria-label', '应用导航')

    this.内容容器.style.flex = '1'
    this.内容容器.style.display = 'flex'
    this.内容容器.style.flexDirection = 'column'
    this.内容容器.style.overflow = 'hidden'

    let 插槽: HTMLSlotElement = 创建元素('slot')
    this.内容容器.appendChild(插槽)

    this.shadow.appendChild(this.导航栏容器)
    this.shadow.appendChild(this.内容容器)
  }

  private 更新布局(): void {
    let style = this.获得宿主样式()
    if (this.是移动端 === true) {
      style.flexDirection = 'column-reverse'
      this.导航栏容器.style.flexDirection = 'row'
      this.导航栏容器.style.height = '60px'
      this.导航栏容器.style.width = '100%'
      this.导航栏容器.style.borderTop = '1px solid var(--边框颜色)'
      this.导航栏容器.style.borderRight = 'none'
      this.导航栏容器.style.justifyContent = 'space-around'
      this.导航栏容器.style.padding = '0'
    } else {
      style.flexDirection = 'row'
      this.导航栏容器.style.flexDirection = 'column'
      this.导航栏容器.style.width = '120px'
      this.导航栏容器.style.height = '100%'
      this.导航栏容器.style.borderRight = '1px solid var(--边框颜色)'
      this.导航栏容器.style.borderTop = 'none'
      this.导航栏容器.style.justifyContent = 'flex-start'
      this.导航栏容器.style.padding = '20px 0'
      this.导航栏容器.style.gap = '10px'
    }
    this.更新UI()
  }

  private 更新UI(): void {
    this.导航栏容器.replaceChildren()
    this.标签按钮列表 = []

    this.标签页列表.forEach((项, idx) => {
      let 选中 = idx === this.当前索引

      let 按钮 = 创建元素('button', {
        type: 'button',
        style: {
          padding: this.是移动端 ? '8px 0' : '10px 20px',
          border: 'none',
          borderLeft: this.是移动端 === false && 选中 === true ? '3px solid var(--主色调)' : 'none',
          borderTop: this.是移动端 === true && 选中 === true ? '3px solid var(--主色调)' : 'none',
          background: 选中 === true ? 'var(--主色调-极淡)' : 'none',
          cursor: 'pointer',
          textAlign: 'center',
          userSelect: 'none',
          color: 选中 === true ? 'var(--主色调)' : 'var(--文字颜色)',
          width: this.是移动端 ? 'auto' : '100%',
          flex: this.是移动端 ? '1' : 'none',
          display: 'flex',
          flexDirection: this.是移动端 ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: this.是移动端 ? 'center' : 'flex-start',
          gap: this.是移动端 ? '2px' : '12px',
          transition: 'background-color 0.2s, color 0.2s, border-color 0.2s',
          fontFamily: 'inherit',
        },
      })
      let 标签标识 = `${this.标签页标识前缀}-tab-${idx}`
      let 面板标识 = `${this.标签页标识前缀}-panel-${idx}`
      按钮.id = 标签标识
      按钮.setAttribute('aria-controls', 面板标识)
      if (选中 === true) 按钮.setAttribute('aria-current', 'page')
      按钮.tabIndex = 选中 ? 0 : -1
      项.内容.id = 面板标识
      项.内容.setAttribute('role', 'region')
      项.内容.setAttribute('aria-labelledby', 标签标识)
      项.内容.hidden = 选中 === false

      if (项.图标 !== undefined && 项.图标 !== '') {
        let 图标元素 = 创建元素('span', {
          textContent: 项.图标,
          style: { fontSize: this.是移动端 ? '20px' : '18px', lineHeight: '1' },
        })
        按钮.appendChild(图标元素)
      }

      let 文字元素 = 创建元素('span', {
        textContent: 项.标签,
        style: { fontSize: this.是移动端 ? '12px' : '16px', fontWeight: 选中 === true ? '600' : '400' },
      })
      按钮.appendChild(文字元素)

      按钮.onclick = (): void => {
        this.安全执行(async (): Promise<void> => await this.切换标签(idx))
      }
      按钮.onkeydown = (事件: KeyboardEvent): void => this.处理标签键盘(事件, idx)

      this.导航栏容器.appendChild(按钮)
      this.标签按钮列表.push(按钮)
    })

    this.标签页列表.forEach((项, idx) => {
      if (idx === this.当前索引) {
        项.内容.style.display = 'flex'
        项.内容.style.flex = '1'
        项.内容.style.flexDirection = 'column'
        项.内容.style.minHeight = '0'
        项.内容.style.minWidth = '0'
        项.内容.style.overflow = 'hidden'
      } else {
        项.内容.style.display = 'none'
      }
    })
  }

  private async 切换标签(index: number): Promise<void> {
    let 目标项 = this.标签页列表[index]
    if (目标项 === undefined) return

    if (this.当前索引 !== index) {
      this.当前索引 = index
      this.确保标签页已挂载(index)
      this.更新UI()
      同步标签页路由(this.配置.路由键, 目标项, index)
      this.派发事件('切换', { 当前索引: index })
    }
  }

  private 确保标签页已挂载(index: number): void {
    let 目标项 = this.标签页列表[index]
    if (this.isConnected === false || 目标项 === undefined || 目标项.已挂载 === true) return
    this.appendChild(目标项.内容)
    目标项.已挂载 = true
  }

  private 处理标签键盘(事件: KeyboardEvent, 当前索引: number): void {
    let 方向: 标签方向 = this.是移动端 ? 'horizontal' : 'vertical'
    let 目标索引 = 计算键盘目标索引(事件, 当前索引, this.标签页列表.length, 方向)
    if (目标索引 === null) return
    事件.preventDefault()
    this.安全执行(async (): Promise<void> => {
      await this.切换标签(目标索引)
      this.标签按钮列表[目标索引]?.focus()
    })
  }

  public async 设置当前索引(index: number): Promise<void> {
    await this.切换标签(index)
  }
}
