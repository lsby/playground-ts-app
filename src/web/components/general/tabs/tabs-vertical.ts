import { 组件基类 } from '../../../base/base'
import { 创建元素 } from '../../../global/tools/create-element'

type 纵向tab配置 = { 路由键?: string | undefined }
export type tabVertical发出事件类型 = { 切换: { 当前索引: number } }
type 监听事件类型 = {}

type 标签页项 = { 标签: string; 内容: HTMLElement; 分组?: string | undefined; 标识?: string | undefined }

export class 纵向tab组件 extends 组件基类<tabVertical发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-tabs-vertical', this)
  }

  private 配置: 纵向tab配置
  private 当前索引: number = 0
  private 标签头容器: HTMLDivElement = 创建元素('div', { className: 'tabs-sidebar' })
  private 插槽容器: HTMLDivElement = 创建元素('div')
  private 标签页列表: 标签页项[] = []
  private 关闭移动端菜单: () => void = (): void => {}

  public constructor(配置: 纵向tab配置 = {}) {
    super()
    this.配置 = 配置
  }

  public 添加标签页(
    配置: { 标签: string; 分组?: string | undefined; 标识?: string | undefined },
    内容: HTMLElement,
  ): void {
    this.标签页列表.push({ 标签: 配置.标签, 分组: 配置.分组, 标识: 配置.标识, 内容 })
    this.appendChild(内容)
  }

  public override async 刷新(): Promise<void> {
    await super.刷新()
    let 目标项 = this.标签页列表[this.当前索引]
    if (目标项 !== undefined) {
      let 内容 = 目标项.内容
      if (内容 instanceof 组件基类) await 内容.刷新()
      for (let 子 of Array.from(内容.children)) if (子 instanceof 组件基类) await 子.刷新()
    }
  }

  protected override async 当加载时(): Promise<void> {
    let 路由键 = this.配置.路由键
    if (typeof 路由键 === 'string') {
      let params = new URLSearchParams(window.location.search)
      let 标识字符串 = params.get(路由键)
      if (标识字符串 !== null) {
        let 索引 = this.标签页列表.findIndex((项) => 项.标识 === 标识字符串)
        if (索引 === -1) {
          let 解析索引 = parseInt(标识字符串)
          if (Number.isNaN(解析索引) === false) 索引 = 解析索引
        }
        if (索引 !== -1 && 索引 >= 0 && 索引 < this.标签页列表.length) {
          this.当前索引 = 索引
        }
      }
    }

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
          background: var(--主要背景颜色, rgba(10, 11, 14, 0.95)) !important;
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

    this.插槽容器.style.flex = '1'
    this.插槽容器.style.display = 'flex'
    this.插槽容器.style.flexDirection = 'column'
    this.插槽容器.style.overflow = 'hidden'

    let 插槽: HTMLSlotElement = 创建元素('slot')
    this.插槽容器.appendChild(插槽)

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
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: '150',
        opacity: '0',
        pointerEvents: 'none',
        transition: 'opacity 0.3s ease',
      },
    })

    // 移动端悬浮菜单按钮
    let 移动端菜单按钮 = 创建元素('button', {
      className: 'tabs-menu-btn',
      style: {
        display: 'none',
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '56px',
        height: '56px',
        borderRadius: '28px',
        background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
        boxShadow: '0 4px 20px rgba(124, 58, 237, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        cursor: 'pointer',
        zIndex: '1000',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        border: 'none',
        outline: 'none',
      },
    })

    let 按钮SVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    按钮SVG.setAttribute('viewBox', '0 0 24 24')
    按钮SVG.style.width = '24px'
    按钮SVG.style.height = '24px'
    按钮SVG.style.fill = '#ffffff'
    let 按钮Path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    按钮Path.setAttribute('d', 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z')
    按钮SVG.appendChild(按钮Path)
    移动端菜单按钮.appendChild(按钮SVG)

    let 打开移动端菜单 = (): void => {
      this.标签头容器.classList.add('open')
      遮罩层.classList.add('open')
    }

    this.关闭移动端菜单 = (): void => {
      this.标签头容器.classList.remove('open')
      遮罩层.classList.remove('open')
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

    this.更新UI()
  }

  private 更新UI(): void {
    this.标签头容器.innerHTML = ''

    let 上一个分组: string | undefined = undefined

    this.标签页列表.forEach((项, idx) => {
      let 选中 = idx === this.当前索引

      // 如果有分组，且与上一个分组不同，则渲染分组标题
      if (项.分组 !== undefined && 项.分组 !== 上一个分组) {
        let 分组标题 = 创建元素('div', {
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
          outline: 'none',
          textAlign: 'left',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: 选中 ? '0 4px 15px var(--tab-阴影)' : 'none',
          width: '100%',
          boxSizing: 'border-box',
        },
      })

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

      按钮.onclick = async (): Promise<void> => {
        await this.切换标签(idx)
        this.关闭移动端菜单()
      }

      this.标签头容器.appendChild(按钮)
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

    if (this.当前索引 !== index) {
      this.当前索引 = index
      this.更新UI()

      let 路由键 = this.配置.路由键
      if (typeof 路由键 === 'string') {
        let params = new URLSearchParams(window.location.search)
        let 值 = 目标项?.标识 ?? index.toString()
        params.set(路由键, 值)
        let newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`
        window.history.replaceState(null, '', newUrl)
      }
      this.派发事件('切换', { 当前索引: index })
    }

    if (目标项 !== undefined) {
      let 内容 = 目标项.内容
      if (内容 instanceof 组件基类) await 内容.刷新()
      for (let 子 of Array.from(内容.children)) if (子 instanceof 组件基类) await 子.刷新()
    }
  }

  public async 设置当前索引(index: number): Promise<void> {
    await this.切换标签(index)
  }
}
