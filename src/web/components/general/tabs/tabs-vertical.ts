import { 组件基类 } from '../../../base/base'
import { 创建元素 } from '../../../global/tools/create-element'
import { 图标组件 } from '../base/icon'
import { 创建标签页标识前缀, 刷新标签页内容, 同步标签页路由, 计算键盘目标索引, 读取标签页索引 } from './tabs-common'

export type 纵向tab配置 = { 路由键?: string | undefined }
export type tabVertical发出事件类型 = { 切换: { 当前索引: number } }
type 监听事件类型 = {}

type 标签页项 = {
  标签: string
  内容: HTMLElement
  分组?: string | undefined
  标识?: string | undefined
  已挂载: boolean
}

/**
 * 标签页采用首次访问懒挂载：添加标签页时内容实例已经创建，但不会立即连接 DOM；
 * 初始化时只挂载当前标签，其他标签在首次激活时才挂载，访问过的标签会保留 DOM 和页面状态。
 *
 * 内容组件的构造函数只应用于初始化字段和创建不会产生副作用的对象。网络请求、定时器、
 * WebSocket、观察器及依赖 DOM 的事件监听应放在 `当加载时` 中，并通过 `注册清理` 或
 * `当卸载时` 释放。构造函数中的副作用会在未访问标签时提前执行，从而绕过懒挂载机制。
 * `当加载时` 可能因刷新或重新连接再次执行，因此其中的逻辑还应保持可重复执行。
 */
export class 纵向tab组件 extends 组件基类<tabVertical发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-tabs-vertical', this)
  }

  private 配置: 纵向tab配置
  private 当前索引: number = 0
  private 标签头容器: HTMLDivElement = 创建元素('div', { className: 'tabs-sidebar' })
  private 插槽容器: HTMLDivElement = 创建元素('div')
  private 标签页列表: 标签页项[] = []
  private 标签按钮列表: HTMLButtonElement[] = []
  private readonly 标签页标识前缀 = 创建标签页标识前缀()
  private 关闭移动端菜单: () => void = (): void => {}

  public constructor(配置: 纵向tab配置 = {}) {
    super()
    this.配置 = 配置
  }

  public 添加标签页(
    配置: { 标签: string; 分组?: string | undefined; 标识?: string | undefined },
    内容: HTMLElement,
  ): void {
    this.标签页列表.push({ 标签: 配置.标签, 分组: 配置.分组, 标识: 配置.标识, 内容, 已挂载: false })
  }

  public override async 刷新(): Promise<void> {
    await super.刷新()
    let 目标项 = this.标签页列表[this.当前索引]
    if (目标项 !== undefined) await 刷新标签页内容(目标项.内容)
  }

  protected override async 当加载时(): Promise<void> {
    this.当前索引 = 读取标签页索引(this.配置.路由键, this.标签页列表, this.当前索引)

    let style = this.获得宿主样式()
    style.display = 'flex'
    style.flexDirection = 'row'
    style.width = '100%'
    style.height = '100%'

    let 滚动条及自适应样式 = 创建元素('style', {
      textContent: `
      /* 移动端响应式 */
      @media (max-width: 768px) {
        .tabs-sidebar {
          position: fixed !important;
          top: 0;
          left: -280px;
          width: 280px !important;
          height: 100% !important;
          z-index: 200;
          background: var(--主要背景颜色) !important;
          backdrop-filter: blur(20px) !important;
          box-shadow: 5px 0 25px var(--深阴影颜色) !important;
          transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border-right: 1px solid var(--边框颜色) !important;
          display: flex !important;
          padding: 30px 20px !important;
          box-sizing: border-box !important;
          overflow-y: auto !important;
        }
        .tabs-sidebar.open {
          left: 0 !important;
        }
        .tabs-backdrop {
          display: block !important;
        }
        .tabs-backdrop.open {
          opacity: 1 !important;
          pointer-events: auto !important;
        }
        .tabs-menu-btn {
          display: flex !important;
        }
      }
    `,
    })
    this.shadow.appendChild(滚动条及自适应样式)

    this.标签头容器.style.display = 'flex'
    this.标签头容器.style.flexDirection = 'column'
    this.标签头容器.style.borderRight = '1px solid var(--边框颜色)'
    this.标签头容器.style.gap = '12px'
    this.标签头容器.style.padding = '1.8em 1.2em'
    this.标签头容器.style.width = '240px'
    this.标签头容器.style.background = 'var(--tab-头部竖向背景)'
    this.标签头容器.style.backdropFilter = 'blur(10px)'
    this.标签头容器.style.flexShrink = '0'
    this.标签头容器.style.overflowY = 'auto'
    this.标签头容器.id = `${this.标签页标识前缀}-tablist`
    this.标签头容器.setAttribute('role', 'tablist')
    this.标签头容器.setAttribute('aria-orientation', 'vertical')
    this.标签头容器.setAttribute('aria-label', '标签页')

    this.插槽容器.style.flex = '1'
    this.插槽容器.style.display = 'flex'
    this.插槽容器.style.flexDirection = 'column'
    this.插槽容器.style.overflow = 'hidden'

    let 插槽: HTMLSlotElement = 创建元素('slot')
    this.插槽容器.replaceChildren(插槽)

    // 移动端遮罩层
    let 遮罩层 = 创建元素('div', {
      className: 'tabs-backdrop',
      style: {
        display: 'none',
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        background: 'var(--遮罩颜色)',
        backdropFilter: 'blur(4px)',
        zIndex: '150',
        opacity: '0',
        pointerEvents: 'none',
        transition: 'opacity 0.3s ease',
      },
    })

    // 移动端悬浮菜单按钮
    let 移动端菜单按钮 = 创建元素('button', {
      type: 'button',
      className: 'tabs-menu-btn',
      title: '打开标签页菜单',
      style: {
        display: 'none',
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '56px',
        height: '56px',
        borderRadius: '28px',
        background: 'var(--主色调)',
        boxShadow: '0 4px 20px color-mix(in srgb, var(--主色调) 40%, transparent)',
        cursor: 'pointer',
        zIndex: '1000',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        border: 'none',
        color: 'var(--主色调文字)',
      },
    })
    移动端菜单按钮.setAttribute('aria-label', '打开标签页菜单')
    移动端菜单按钮.setAttribute('aria-controls', this.标签头容器.id)
    移动端菜单按钮.setAttribute('aria-expanded', 'false')

    移动端菜单按钮.appendChild(new 图标组件('menu', 24))

    let 打开移动端菜单 = (): void => {
      this.标签头容器.classList.add('open')
      遮罩层.classList.add('open')
      移动端菜单按钮.setAttribute('aria-expanded', 'true')
    }

    this.关闭移动端菜单 = (): void => {
      this.标签头容器.classList.remove('open')
      遮罩层.classList.remove('open')
      移动端菜单按钮.setAttribute('aria-expanded', 'false')
    }

    移动端菜单按钮.onclick = (事件: MouseEvent): void => {
      事件.stopPropagation()
      if (this.标签头容器.classList.contains('open') === true) {
        this.关闭移动端菜单()
      } else {
        打开移动端菜单()
      }
    }

    遮罩层.onclick = (): void => {
      this.关闭移动端菜单()
    }

    this.shadow.appendChild(this.标签头容器)
    this.shadow.appendChild(this.插槽容器)
    this.shadow.appendChild(遮罩层)
    this.shadow.appendChild(移动端菜单按钮)

    this.确保标签页已挂载(this.当前索引)
    this.更新UI()
  }

  private 更新UI(): void {
    this.标签头容器.replaceChildren()
    this.标签按钮列表 = []

    let 上一个分组: string | undefined = undefined

    this.标签页列表.forEach((项, idx) => {
      let 选中 = idx === this.当前索引

      // 如果有分组，且与上一个分组不同，则渲染分组标题
      if (项.分组 !== undefined && 项.分组 !== 上一个分组) {
        let 分组标题 = 创建元素('div', {
          role: 'presentation',
          textContent: 项.分组,
          style: {
            fontSize: '12px',
            textTransform: 'uppercase',
            color: 'var(--次要文字颜色)',
            fontWeight: '600',
            letterSpacing: '0.1em',
            marginTop: 上一个分组 === undefined ? '0' : '18px',
            marginBottom: '6px',
            paddingLeft: '12px',
            userSelect: 'none',
          },
        })
        this.标签头容器.appendChild(分组标题)
        上一个分组 = 项.分组
      }

      let 按钮 = 创建元素('button', {
        type: 'button',
        textContent: 项.标签,
        style: {
          padding: '0.7em 1.2em',
          border: '1px solid transparent',
          borderLeft: 选中 ? '3px solid var(--tab-指示条)' : '3px solid transparent',
          borderTop: 选中 ? '1px solid var(--tab-激活边框)' : '1px solid transparent',
          borderRight: 选中 ? '1px solid var(--tab-激活边框)' : '1px solid transparent',
          borderBottom: 选中 ? '1px solid var(--tab-激活边框)' : '1px solid transparent',
          borderRadius: '8px',
          background: 选中 ? 'var(--tab-激活背景)' : 'transparent',
          color: 选中 ? 'var(--tab-激活文字)' : 'var(--tab-未激活文字)',
          fontWeight: '600',
          fontSize: '0.92em',
          cursor: 'pointer',
          userSelect: 'none',
          textAlign: 'left',
          transition:
            'background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: 选中 ? '0 4px 15px var(--tab-阴影)' : 'none',
          width: '100%',
          boxSizing: 'border-box',
        },
      })
      let 标签标识 = `${this.标签页标识前缀}-tab-${idx}`
      let 面板标识 = `${this.标签页标识前缀}-panel-${idx}`
      按钮.id = 标签标识
      按钮.setAttribute('role', 'tab')
      按钮.setAttribute('aria-controls', 面板标识)
      按钮.setAttribute('aria-selected', 选中 ? 'true' : 'false')
      按钮.tabIndex = 选中 ? 0 : -1
      项.内容.id = 面板标识
      项.内容.setAttribute('role', 'tabpanel')
      项.内容.setAttribute('aria-labelledby', 标签标识)
      项.内容.hidden = 选中 === false

      if (选中 === false) {
        按钮.onmouseenter = (): void => {
          按钮.style.backgroundColor = 'var(--tab-悬浮背景)'
          按钮.style.color = 'var(--tab-悬浮文字)'
          按钮.style.transform = 'translateX(3px)'
          按钮.style.borderLeft = '3px solid var(--tab-激活边框)'
        }
        按钮.onmouseleave = (): void => {
          按钮.style.backgroundColor = 'transparent'
          按钮.style.color = 'var(--tab-未激活文字)'
          按钮.style.transform = 'translateX(0)'
          按钮.style.borderLeft = '3px solid transparent'
        }
      } else {
        按钮.onmouseenter = (): void => {
          按钮.style.transform = 'translateX(3px)'
          按钮.style.boxShadow = '0 6px 20px var(--tab-阴影)'
          按钮.style.borderLeft = '3px solid var(--tab-指示条)'
        }
        按钮.onmouseleave = (): void => {
          按钮.style.transform = 'translateX(0)'
          按钮.style.boxShadow = '0 4px 15px var(--tab-阴影)'
          按钮.style.borderLeft = '3px solid var(--tab-指示条)'
        }
      }

      按钮.onclick = (): void => {
        this.安全执行(async (): Promise<void> => {
          await this.切换标签(idx)
          this.关闭移动端菜单()
        })
      }
      按钮.onkeydown = (事件: KeyboardEvent): void => this.处理标签键盘(事件, idx)

      this.标签头容器.appendChild(按钮)
      this.标签按钮列表.push(按钮)
    })

    this.标签页列表.forEach((项, idx) => {
      if (idx === this.当前索引) {
        项.内容.style.display = 'flex'
        项.内容.style.flex = '1'
        项.内容.style.flexDirection = 'column'
        项.内容.style.minHeight = '0'
        项.内容.style.minWidth = '0'
        let 已经有overflow样式: boolean =
          项.内容.style.overflow !== '' || 项.内容.style.overflowY !== '' || 项.内容.style.overflowX !== ''
        if (已经有overflow样式 === false) {
          项.内容.style.overflow = 'auto'
        }
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
    let 目标索引 = 计算键盘目标索引(事件, 当前索引, this.标签页列表.length, 'vertical')
    if (目标索引 === null) return
    事件.preventDefault()
    this.安全执行(async (): Promise<void> => {
      await this.切换标签(目标索引)
      this.标签按钮列表[目标索引]?.focus()
      this.关闭移动端菜单()
    })
  }

  public async 设置当前索引(index: number): Promise<void> {
    await this.切换标签(index)
  }
}
