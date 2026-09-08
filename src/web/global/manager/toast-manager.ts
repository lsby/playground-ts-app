import { 创建图标, type 图标名称 } from '../../components/general/base/icon'
import { 创建元素 } from '../tools/create-element'

export type 吐司类型 = 'success' | 'error' | 'warning' | 'info'
export type 吐司位置 = 'top' | 'bottom' | 'center'
export type 吐司选项 = { 类型?: 吐司类型; 持续时间?: number; 位置?: 吐司位置 }
type 吐司样式 = { 背景色变量: string; 图标: 图标名称 }

class 吐司管理器类 {
  private 容器映射 = new Map<吐司位置, HTMLDivElement>()
  private 样式配置: Record<吐司类型, 吐司样式> = {
    success: { 背景色变量: 'var(--成功颜色)', 图标: 'check' },
    error: { 背景色变量: 'var(--错误颜色)', 图标: 'error' },
    warning: { 背景色变量: 'var(--警告颜色)', 图标: 'warning' },
    info: { 背景色变量: 'var(--信息颜色)', 图标: 'info' },
  }

  public 显示(消息: string, 选项: 吐司选项 = {}): void {
    let 类型 = 选项.类型 ?? 'info'
    let 持续时间 = 选项.持续时间 ?? 3000
    let 位置 = 选项.位置 ?? 'top'
    let 容器 = this.获得容器(位置)
    let 样式 = this.样式配置[类型]
    let 吐司元素 = 创建元素('div', {
      role: 类型 === 'error' ? 'alert' : 'status',
      tabIndex: 0,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--间距-2)',
        minWidth: '220px',
        maxWidth: 'min(500px, calc(100vw - 32px))',
        padding: 'var(--间距-3) var(--间距-4)',
        boxSizing: 'border-box',
        borderRadius: 'var(--圆角-中)',
        backgroundColor: 样式.背景色变量,
        color: 'var(--吐司文字颜色)',
        boxShadow: 'var(--深阴影)',
        pointerEvents: 'auto',
        opacity: '0',
        transform: this.获得隐藏变换(位置),
        transition: 'opacity var(--动画-正常), transform var(--动画-正常)',
      },
    })
    let 消息元素 = 创建元素('span', { textContent: 消息, style: { flex: '1', overflowWrap: 'anywhere' } })
    let 关闭按钮 = 创建元素('button', {
      type: 'button',
      title: '关闭通知',
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        padding: '0',
        border: '0',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
      },
    })
    关闭按钮.append(创建图标('close', 16))
    吐司元素.append(创建图标(样式.图标, 18), 消息元素, 关闭按钮)
    容器.append(吐司元素)

    let 已移除 = false
    let 自动关闭计时器: number | undefined
    let 移除 = (): void => {
      if (已移除 === true) return
      已移除 = true
      if (自动关闭计时器 !== undefined) window.clearTimeout(自动关闭计时器)
      吐司元素.style.opacity = '0'
      吐司元素.style.transform = this.获得隐藏变换(位置)
      window.setTimeout((): void => {
        吐司元素.remove()
        if (容器.childElementCount === 0) {
          容器.remove()
          this.容器映射.delete(位置)
        }
      }, 200)
    }
    关闭按钮.onclick = 移除
    吐司元素.onkeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') 移除()
    }
    requestAnimationFrame((): void => {
      吐司元素.style.opacity = '1'
      吐司元素.style.transform = 'translate(0, 0) scale(1)'
    })
    if (持续时间 > 0) 自动关闭计时器 = window.setTimeout(移除, 持续时间)
  }

  private 获得容器(位置: 吐司位置): HTMLDivElement {
    let 已有容器 = this.容器映射.get(位置)
    if (已有容器 !== undefined && 已有容器.isConnected === true) return 已有容器
    let 容器 = 创建元素('div', {
      style: {
        position: 'fixed',
        left: '50%',
        zIndex: 'calc(var(--浮层起始层级) + 100)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--间距-2)',
        width: 'fit-content',
        maxWidth: 'calc(100vw - 32px)',
        pointerEvents: 'none',
        transform: 位置 === 'center' ? 'translate(-50%, -50%)' : 'translateX(-50%)',
      },
    })
    if (位置 === 'top') 容器.style.top = 'var(--间距-5)'
    else if (位置 === 'bottom') {
      容器.style.bottom = 'var(--间距-5)'
      容器.style.flexDirection = 'column-reverse'
    } else 容器.style.top = '50%'
    document.body.append(容器)
    this.容器映射.set(位置, 容器)
    return 容器
  }

  private 获得隐藏变换(位置: 吐司位置): string {
    if (位置 === 'top') return 'translateY(-12px)'
    if (位置 === 'bottom') return 'translateY(12px)'
    return 'scale(0.96)'
  }
}

let 吐司管理器实例 = new 吐司管理器类()
export function 显示吐司(消息: string, 选项: 吐司选项 = {}): void {
  吐司管理器实例.显示(消息, 选项)
}
export function 成功提示(消息: string, 持续时间?: number): void {
  吐司管理器实例.显示(消息, { 类型: 'success', ...(持续时间 === undefined ? {} : { 持续时间 }) })
}
export function 错误提示(消息: string, 持续时间?: number): void {
  吐司管理器实例.显示(消息, { 类型: 'error', ...(持续时间 === undefined ? {} : { 持续时间 }) })
}
export function 警告提示(消息: string, 持续时间?: number): void {
  吐司管理器实例.显示(消息, { 类型: 'warning', ...(持续时间 === undefined ? {} : { 持续时间 }) })
}
export function 信息提示(消息: string, 持续时间?: number): void {
  吐司管理器实例.显示(消息, { 类型: 'info', ...(持续时间 === undefined ? {} : { 持续时间 }) })
}
