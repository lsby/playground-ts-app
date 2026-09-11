import { 创建元素 } from '../tools/create-element'
import { 浮层管理器, type 浮层句柄 } from './overlay-manager'

export type 提示数据 = { 文本?: string; 内容?: Node; html?: string }

class 提示管理器内部 {
  private 句柄: 浮层句柄 | null = null
  private 位置监听 = new AbortController()

  public 显示(数据: 提示数据, 目标: HTMLElement): void {
    this.隐藏()
    let 浮窗 = 创建元素('div', {
      role: 'tooltip',
      style: {
        position: 'fixed',
        maxWidth: '350px',
        maxHeight: 'min(480px, 80vh)',
        overflow: 'auto',
        padding: 'var(--间距-3)',
        backgroundColor: 'var(--卡片背景颜色)',
        color: 'var(--文字颜色)',
        border: '1px solid var(--边框颜色)',
        borderRadius: 'var(--圆角-中)',
        boxShadow: 'var(--浅阴影)',
        lineHeight: 'var(--行高-正文)',
        pointerEvents: 'none',
      },
    })
    if (数据.内容 !== undefined) 浮窗.append(数据.内容)
    else 浮窗.textContent = 数据.文本 ?? 数据.html ?? ''
    this.句柄 = 浮层管理器.打开({ 根元素: 浮窗, 内容元素: 浮窗, 外部关闭: '不关闭', 允许Escape关闭: false })
    let 更新 = (): void => this.更新位置(浮窗, 目标)
    更新()
    this.位置监听.abort()
    this.位置监听 = new AbortController()
    window.addEventListener('resize', 更新, { signal: this.位置监听.signal })
    window.addEventListener('scroll', 更新, { capture: true, signal: this.位置监听.signal })
  }

  public 隐藏(): void {
    this.位置监听.abort()
    let 句柄 = this.句柄
    this.句柄 = null
    if (句柄 !== null) void 句柄.关闭().catch((错误: unknown): void => console.error('关闭提示浮层失败:', 错误))
  }

  private 更新位置(浮窗: HTMLElement, 目标: HTMLElement): void {
    let 目标矩形 = 目标.getBoundingClientRect()
    let 浮窗矩形 = 浮窗.getBoundingClientRect()
    let 边距 = 8
    let 左 = Math.max(边距, Math.min(目标矩形.left, window.innerWidth - 浮窗矩形.width - 边距))
    let 下方 = 目标矩形.bottom + 边距
    let 上方 = 目标矩形.top - 浮窗矩形.height - 边距
    let 上 = 下方 + 浮窗矩形.height <= window.innerHeight - 边距 ? 下方 : Math.max(边距, 上方)
    浮窗.style.left = `${左}px`
    浮窗.style.top = `${上}px`
  }
}

export let 提示管理器 = new 提示管理器内部()
