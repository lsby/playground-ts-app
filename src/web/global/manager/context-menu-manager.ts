import { 创建元素 } from '../tools/create-element'
import { 浮层管理器, type 浮层句柄 } from './overlay-manager'

export type 右键菜单项 =
  | { 文本: string; 回调: () => void | Promise<void>; 图标?: Node; 快捷键?: string; 禁用?: boolean; 危险?: boolean }
  | '分隔符'

export class 右键菜单管理器 {
  private static 实例: 右键菜单管理器 | null = null
  public static 获得实例(): 右键菜单管理器 {
    if (this.实例 === null) this.实例 = new 右键菜单管理器()
    return this.实例
  }
  private 当前句柄: 浮层句柄 | null = null
  private 当前关闭回调: (() => void) | null = null

  private constructor() {}

  public 显示菜单(x: number, y: number, 菜单项列表: 右键菜单项[], 关闭回调?: () => void): void {
    void this.隐藏菜单()
    this.当前关闭回调 = 关闭回调 ?? null
    let 菜单 = 创建元素('div', {
      role: 'menu',
      tabIndex: -1,
      style: {
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        minWidth: '180px',
        maxWidth: 'min(320px, calc(100vw - 16px))',
        padding: 'var(--间距-1)',
        backgroundColor: 'var(--卡片背景颜色)',
        color: 'var(--文字颜色)',
        border: '1px solid var(--边框颜色)',
        borderRadius: 'var(--圆角-中)',
        boxShadow: 'var(--深阴影)',
        boxSizing: 'border-box',
      },
    })
    let 按钮们: HTMLButtonElement[] = []
    for (let 菜单项 of 菜单项列表) {
      if (菜单项 === '分隔符') {
        菜单.append(
          创建元素('div', {
            role: 'separator',
            style: { height: '1px', margin: 'var(--间距-1) 0', backgroundColor: 'var(--边框颜色)' },
          }),
        )
        continue
      }
      let 按钮 = 创建元素('button', {
        type: 'button',
        role: 'menuitem',
        disabled: 菜单项.禁用 ?? false,
        style: {
          width: '100%',
          minHeight: '34px',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--间距-2)',
          padding: '0 var(--间距-2)',
          border: '0',
          borderRadius: 'var(--圆角-小)',
          backgroundColor: 'transparent',
          color: 菜单项.危险 === true ? 'var(--错误颜色)' : 'var(--文字颜色)',
          textAlign: 'left',
          cursor: 菜单项.禁用 === true ? 'not-allowed' : 'pointer',
        },
      })
      if (菜单项.图标 !== undefined) 按钮.append(菜单项.图标)
      按钮.append(创建元素('span', { textContent: 菜单项.文本, style: { flex: '1' } }))
      if (菜单项.快捷键 !== undefined)
        按钮.append(创建元素('kbd', { textContent: 菜单项.快捷键, style: { color: 'var(--次要文字颜色)' } }))
      按钮.onmouseenter = (): void => {
        if (按钮.disabled === false) 按钮.style.backgroundColor = 'var(--悬浮背景颜色)'
      }
      按钮.onmouseleave = (): void => {
        按钮.style.backgroundColor = 'transparent'
      }
      按钮.onclick = (): void => {
        if (按钮.disabled === true) return
        void this.隐藏菜单().then(async (): Promise<void> => await 菜单项.回调())
      }
      菜单.append(按钮)
      if (按钮.disabled === false) 按钮们.push(按钮)
    }
    菜单.onkeydown = (event: KeyboardEvent): void => this.处理键盘(event, 按钮们)
    let 句柄 = 浮层管理器.打开({
      根元素: 菜单,
      内容元素: 菜单,
      外部关闭: '任意外部',
      允许Escape关闭: true,
      请求关闭: async (): Promise<void> => await this.隐藏菜单(),
    })
    this.当前句柄 = 句柄
    this.调整位置(菜单, x, y)
    queueMicrotask((): void => (按钮们[0] ?? 菜单).focus())
  }

  public async 隐藏菜单(): Promise<void> {
    let 句柄 = this.当前句柄
    let 回调 = this.当前关闭回调
    this.当前句柄 = null
    this.当前关闭回调 = null
    if (句柄 !== null) await 句柄.关闭()
    回调?.()
  }

  private 调整位置(菜单: HTMLElement, x: number, y: number): void {
    let 边距 = 8
    let 左 = Math.max(边距, Math.min(x, window.innerWidth - 菜单.offsetWidth - 边距))
    let 上 = Math.max(边距, Math.min(y, window.innerHeight - 菜单.offsetHeight - 边距))
    菜单.style.left = `${左}px`
    菜单.style.top = `${上}px`
  }

  private 处理键盘(event: KeyboardEvent, 按钮们: HTMLButtonElement[]): void {
    if (按钮们.length === 0) return
    let 当前索引 = 按钮们.findIndex((按钮) => 按钮 === document.activeElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      let 方向 = event.key === 'ArrowDown' ? 1 : -1
      let 下一索引 = (当前索引 + 方向 + 按钮们.length) % 按钮们.length
      按钮们[下一索引]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      按钮们[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      按钮们[按钮们.length - 1]?.focus()
    }
  }
}
