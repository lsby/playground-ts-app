import { 组件基类 } from '../../../base/base'
import { 创建元素, 应用样式 } from '../../../global/tools/create-element'
import { 滚动容器 } from '../base/scroll-container'
import {
  创建标签页标识前缀,
  刷新标签页内容,
  同步标签页选择状态,
  标签页状态管理器,
  需要重建标签按钮,
} from './tabs-common'

export type 横向tab配置 = { 路由键?: string | undefined }
export type tabHorizontal发出事件类型 = { 切换: { 当前索引: number } }
type 监听事件类型 = {}

type 标签页项 = { 标签: string; 内容: HTMLElement; 内容滚动容器: 滚动容器; 标识?: string | undefined; 已挂载: boolean }

/**
 * 标签页采用首次访问懒挂载：添加标签页时内容实例已经创建，但不会立即连接 DOM；
 * 初始化时只挂载当前标签，其他标签在首次激活时才挂载，访问过的标签会保留 DOM 和页面状态。
 *
 * 内容组件的构造函数只应用于初始化字段和创建不会产生副作用的对象。网络请求、定时器、
 * WebSocket、观察器及依赖 DOM 的事件监听应放在 `当加载时` 中，并通过 `注册清理` 或
 * `当卸载时` 释放。构造函数中的副作用会在未访问标签时提前执行，从而绕过懒挂载机制。
 * `当加载时` 可能因刷新或重新连接再次执行，因此其中的逻辑还应保持可重复执行。
 */
export class 横向tab组件 extends 组件基类<tabHorizontal发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-tabs-horizontal', this)
  }

  private 配置: 横向tab配置
  private 标签头容器: HTMLDivElement = 创建元素('div')
  private 插槽容器: HTMLDivElement = 创建元素('div')
  private 标签页列表: 标签页项[] = []
  private 标签按钮列表: HTMLButtonElement[] = []
  private readonly 标签页标识前缀 = 创建标签页标识前缀()
  private readonly 状态管理器: 标签页状态管理器<标签页项>

  public constructor(配置: 横向tab配置 = {}) {
    super()
    this.配置 = 配置
    this.状态管理器 = new 标签页状态管理器(this.配置.路由键, (): readonly 标签页项[] => this.标签页列表)
  }

  public 添加标签页(配置: { 标签: string; 标识?: string | undefined }, 内容: HTMLElement): void {
    let 内容滚动容器 = new 滚动容器({ 方向: 'vertical' })
    let 滚动容器样式 = 内容滚动容器.获得宿主样式()
    滚动容器样式.flex = '1'
    滚动容器样式.minWidth = '0'
    滚动容器样式.minHeight = '0'
    内容滚动容器.appendChild(内容)
    this.标签页列表.push({ 标签: 配置.标签, 标识: 配置.标识, 内容, 内容滚动容器, 已挂载: false })
    if (this.isConnected === true) {
      this.确保标签页已挂载(this.状态管理器.获得当前索引())
      this.更新UI()
    }
  }

  public override async 刷新(): Promise<void> {
    this.更新UI()
    let 目标项 = this.标签页列表[this.状态管理器.获得当前索引()]
    if (目标项 !== undefined) await 刷新标签页内容(目标项.内容)
  }

  protected override async 当加载时(): Promise<void> {
    this.状态管理器.从路由同步()

    let style = this.获得宿主样式()
    style.display = 'flex'
    style.flexDirection = 'column'
    style.width = '100%'
    style.height = '100%'

    this.标签头容器.style.display = 'flex'
    this.标签头容器.style.borderBottom = '1px solid var(--边框颜色)'
    this.标签头容器.style.gap = '15px'
    this.标签头容器.style.padding = '0.8em 1.8em'
    this.标签头容器.style.alignItems = 'center'
    this.标签头容器.style.background = 'var(--tab-头部背景)'
    this.标签头容器.style.backdropFilter = 'blur(10px)'
    this.标签头容器.style.overflowX = 'auto'
    this.标签头容器.style.flexShrink = '0'
    this.标签头容器.setAttribute('role', 'tablist')
    this.标签头容器.setAttribute('aria-label', '标签页')
    this.标签头容器.style.scrollbarWidth = 'none' // Firefox

    this.插槽容器.style.flex = '1'
    this.插槽容器.style.display = 'flex'
    this.插槽容器.style.flexDirection = 'column'
    this.插槽容器.style.overflow = 'hidden'

    let 插槽: HTMLSlotElement = 创建元素('slot')
    this.插槽容器.replaceChildren(插槽)

    this.shadow.appendChild(this.标签头容器)
    this.shadow.appendChild(this.插槽容器)

    this.确保标签页已挂载(this.状态管理器.获得当前索引())
    this.更新UI()
  }

  private 更新UI(): void {
    let 重建按钮 = 需要重建标签按钮(this.标签按钮列表.length, this.标签页列表.length)
    if (重建按钮 === true) {
      this.标签头容器.replaceChildren()
      this.标签按钮列表 = []
    }

    this.标签页列表.forEach((项, idx) => {
      let 选中 = idx === this.状态管理器.获得当前索引()
      let 按钮 = this.标签按钮列表[idx] ?? 创建元素('button', { type: 'button' })
      按钮.textContent = 项.标签
      应用样式(按钮, {
        padding: '0.55em 1.3em',
        border: '1px solid transparent',
        borderRadius: '10px',
        background: 选中 ? 'var(--tab-激活背景)' : 'transparent',
        borderColor: 选中 ? 'var(--tab-激活边框)' : 'transparent',
        color: 选中 ? 'var(--tab-激活文字)' : 'var(--tab-未激活文字)',
        fontWeight: '600',
        fontSize: '0.92em',
        cursor: 'pointer',
        userSelect: 'none',
        boxShadow: 选中 ? '0 4px 15px var(--tab-阴影)' : 'none',
        transition:
          'background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      })
      let 标签标识 = `${this.标签页标识前缀}-tab-${idx}`
      let 面板标识 = `${this.标签页标识前缀}-panel-${idx}`
      按钮.id = 标签标识
      按钮.setAttribute('role', 'tab')
      按钮.setAttribute('aria-controls', 面板标识)
      项.内容滚动容器.id = 面板标识
      项.内容滚动容器.setAttribute('role', 'tabpanel')
      项.内容滚动容器.setAttribute('aria-labelledby', 标签标识)
      同步标签页选择状态(按钮, 项.内容滚动容器, 选中, 'block')

      if (选中 === false) {
        按钮.onmouseenter = (): void => {
          按钮.style.backgroundColor = 'var(--tab-悬浮背景)'
          按钮.style.color = 'var(--tab-悬浮文字)'
          按钮.style.transform = 'translateY(-1px)'
        }
        按钮.onmouseleave = (): void => {
          按钮.style.backgroundColor = 'transparent'
          按钮.style.color = 'var(--tab-未激活文字)'
          按钮.style.transform = 'translateY(0)'
        }
      } else {
        按钮.onmouseenter = (): void => {
          按钮.style.transform = 'translateY(-1px)'
          按钮.style.boxShadow = '0 6px 20px var(--tab-阴影)'
        }
        按钮.onmouseleave = (): void => {
          按钮.style.transform = 'translateY(0)'
          按钮.style.boxShadow = '0 4px 15px var(--tab-阴影)'
        }
      }

      按钮.onclick = (): void => {
        this.安全执行(async (): Promise<void> => await this.切换标签(idx))
      }
      按钮.onkeydown = (事件: KeyboardEvent): void => this.处理标签键盘(事件, idx)

      if (重建按钮 === true) {
        this.标签头容器.appendChild(按钮)
        this.标签按钮列表.push(按钮)
      }
    })
  }

  private async 切换标签(index: number): Promise<void> {
    if (this.状态管理器.切换(index) === null) return
    this.确保标签页已挂载(index)
    this.更新UI()
    this.派发事件('切换', { 当前索引: index })
  }

  private 确保标签页已挂载(index: number): void {
    let 目标项 = this.标签页列表[index]
    if (this.isConnected === false || 目标项 === undefined || 目标项.已挂载 === true) return
    this.appendChild(目标项.内容滚动容器)
    目标项.已挂载 = true
  }

  private 处理标签键盘(事件: KeyboardEvent, 当前索引: number): void {
    let 目标索引 = this.状态管理器.计算键盘目标(事件, 当前索引, 'horizontal')
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
