type 吐司类型 = 'success' | 'error' | 'warning' | 'info'

interface 吐司选项 {
  类型?: 吐司类型
  持续时间?: number
  位置?: 'top' | 'bottom' | 'center'
}

import { 创建元素 } from '../tools/create-element'

class 吐司管理器类 {
  private 容器: HTMLDivElement | null = null

  private 样式配置: Record<吐司类型, { 背景色变量: string; 图标: string }> = {
    success: { 背景色变量: 'var(--成功颜色)', 图标: '✓' },
    error: { 背景色变量: 'var(--错误颜色)', 图标: '✕' },
    warning: { 背景色变量: 'var(--警告颜色)', 图标: '⚠' },
    info: { 背景色变量: 'var(--信息颜色)', 图标: 'ℹ' },
  }

  private 获取容器(位置: 'top' | 'bottom' | 'center'): HTMLDivElement {
    if (this.容器 === null || this.容器.parentElement === null) {
      this.容器 = 创建元素('div', {
        style: {
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: '10001',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'none',
          maxWidth: '90%',
          width: 'fit-content',
        },
      })
      document.body.appendChild(this.容器)
    }

    if (位置 === 'top') {
      this.容器.style.top = '20px'
      this.容器.style.bottom = 'auto'
    } else if (位置 === 'bottom') {
      this.容器.style.bottom = '20px'
      this.容器.style.top = 'auto'
    } else {
      this.容器.style.top = '50%'
      this.容器.style.bottom = 'auto'
      this.容器.style.transform = 'translate(-50%, -50%)'
    }

    return this.容器
  }

  public 显示(消息: string, 选项: 吐司选项 = {}): void {
    let 类型 = 选项.类型 ?? 'info'
    let 持续时间 = 选项.持续时间 ?? 3000
    let 位置 = 选项.位置 ?? 'top'

    let 容器 = this.获取容器(位置)
    let 样式 = this.样式配置[类型]

    let 吐司元素 = 创建元素('div', {
      style: {
        backgroundColor: 样式.背景色变量,
        color: 'var(--吐司文字颜色)',
        padding: '12px 24px',
        borderRadius: '4px',
        boxShadow: '0 4px 12px var(--吐司阴影)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        lineHeight: '1.5',
        pointerEvents: 'auto',
        cursor: 'pointer',
        minWidth: '200px',
        maxWidth: '500px',
        opacity: '0',
        transform: 位置 === 'top' ? 'translateY(-20px)' : 位置 === 'bottom' ? 'translateY(20px)' : 'scale(0.9)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        wordBreak: 'break-word',
      },
    })

    let 图标元素 = 创建元素('span', { style: { fontSize: '16px', fontWeight: 'bold', flexShrink: '0' } })
    图标元素.textContent = 样式.图标

    let 消息元素 = 创建元素('span', { style: { flex: '1' } })
    消息元素.textContent = 消息

    吐司元素.appendChild(图标元素)
    吐司元素.appendChild(消息元素)
    容器.appendChild(吐司元素)

    setTimeout(() => {
      吐司元素.style.opacity = '1'
      吐司元素.style.transform = 位置 === 'center' ? 'scale(1)' : 'translateY(0)'
    }, 10)

    let 移除 = (): void => {
      吐司元素.style.opacity = '0'
      吐司元素.style.transform =
        位置 === 'top' ? 'translateY(-20px)' : 位置 === 'bottom' ? 'translateY(20px)' : 'scale(0.9)'

      setTimeout(() => {
        if (吐司元素.parentElement === 容器) {
          容器.removeChild(吐司元素)
        }
        if (容器.children.length === 0 && 容器.parentElement === document.body) {
          document.body.removeChild(容器)
          this.容器 = null
        }
      }, 300)
    }

    吐司元素.onclick = 移除
    if (持续时间 > 0) {
      setTimeout(移除, 持续时间)
    }
  }
}

let 吐司管理器实例 = new 吐司管理器类()

export function 显示吐司(消息: string, 选项: 吐司选项 = {}): void {
  吐司管理器实例.显示(消息, 选项)
}

export function 成功提示(消息: string, 持续时间?: number): void {
  let 选项: 吐司选项 = { 类型: 'success' }
  if (持续时间 !== undefined) {
    选项.持续时间 = 持续时间
  }
  吐司管理器实例.显示(消息, 选项)
}

export function 错误提示(消息: string, 持续时间?: number): void {
  let 选项: 吐司选项 = { 类型: 'error' }
  if (持续时间 !== undefined) {
    选项.持续时间 = 持续时间
  }
  吐司管理器实例.显示(消息, 选项)
}

export function 警告提示(消息: string, 持续时间?: number): void {
  let 选项: 吐司选项 = { 类型: 'warning' }
  if (持续时间 !== undefined) {
    选项.持续时间 = 持续时间
  }
  吐司管理器实例.显示(消息, 选项)
}

export function 信息提示(消息: string, 持续时间?: number): void {
  let 选项: 吐司选项 = { 类型: 'info' }
  if (持续时间 !== undefined) {
    选项.持续时间 = 持续时间
  }
  吐司管理器实例.显示(消息, 选项)
}
