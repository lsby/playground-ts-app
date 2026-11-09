import type { Page } from '@playwright/test'

import type { 提示卡片参数 } from './types'

/**
 * 测试提示卡片供观察者阅读说明和继续演示。
 * 每张卡片归属于一个页面，记录自身是否正在展示，并承载阶段对应的视觉和拖动交互。
 */
export class 测试提示卡片 {
  private 页面: Page
  private 正在展示 = false

  public constructor(页面: Page) {
    if (页面.isClosed() === true) throw new Error('测试提示卡片的页面已关闭')
    this.页面 = 页面
  }

  public async 展示(参数: 提示卡片参数): Promise<void> {
    if (this.页面.isClosed() === true) throw new Error('测试提示卡片的页面已关闭')
    if (this.正在展示 === true) throw new Error('当前浏览器测试已有提示卡片，请按顺序展示')
    this.正在展示 = true
    try {
      await this.页面.evaluate(this.渲染提示卡片, 参数)
    } finally {
      this.正在展示 = false
    }
  }

  /** 整个方法会被序列化到浏览器执行，内部不能依赖 this 或模块变量。 */
  private 渲染提示卡片(参数: 提示卡片参数): Promise<void> {
    return new Promise<void>((完成等待): void => {
      let 主题: { 标题: string; 徽章?: string; 强调色: string; 背景: string; 按钮背景: string; 按钮文字: string }
      switch (参数.阶段) {
        case '开场':
          主题 = {
            标题: '测试演示目标',
            徽章: '演示开场',
            强调色: '#c7d2fe',
            背景: 'rgba(30, 27, 75, 0.86)',
            按钮背景: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            按钮文字: '开始演示 (Enter)',
          }
          break
        case '步骤':
          主题 = {
            标题: '步骤指引',
            强调色: '#93c5fd',
            背景: 'rgba(15, 23, 42, 0.78)',
            按钮背景: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            按钮文字: '继续演示 (Enter)',
          }
          break
        case '完成':
          主题 = {
            标题: '本阶段演示完成',
            徽章: '已通过',
            强调色: '#6ee7b7',
            背景: 'rgba(6, 78, 59, 0.82)',
            按钮背景: 'linear-gradient(135deg, #059669, #047857)',
            按钮文字: '完成并继续 (Enter)',
          }
          break
      }

      let 原焦点 = document.activeElement
      while (原焦点?.shadowRoot?.activeElement instanceof Element) 原焦点 = 原焦点.shadowRoot.activeElement

      // 独立文档隔离指针与键盘事件，包括业务页面在捕获阶段的监听器。
      let 卡片框 = document.createElement('iframe')
      卡片框.title = 主题.标题
      卡片框.style.position = 'fixed'
      卡片框.style.zIndex = '999999'
      卡片框.style.border = '0'
      卡片框.style.borderRadius = 参数.阶段 === '步骤' ? '12px' : '14px'
      卡片框.style.boxShadow = '0 24px 60px rgba(0, 0, 0, 0.45)'
      卡片框.style.backdropFilter = 'blur(16px)'
      卡片框.style.maxHeight = 'calc(100% - 48px)'
      if (参数.阶段 === '步骤') {
        卡片框.style.right = '24px'
        卡片框.style.bottom = '24px'
        卡片框.style.width = 'min(380px, calc(100vw - 48px))'
      } else {
        卡片框.style.left = '50%'
        卡片框.style.top = '50%'
        卡片框.style.transform = 'translate(-50%, -50%)'
        卡片框.style.width = 'min(520px, calc(100vw - 48px))'
      }
      document.body.append(卡片框)
      let 卡片文档 = 卡片框.contentDocument
      if (卡片文档 === null) {
        卡片框.remove()
        throw new Error('无法创建测试提示卡片文档')
      }
      卡片文档.body.style.margin = '0'

      let 卡片 = 卡片文档.createElement('aside')
      卡片.setAttribute('role', 'dialog')
      卡片.setAttribute('aria-label', 主题.标题)
      卡片.style.boxSizing = 'border-box'
      卡片.style.font = '15px/1.65 system-ui, "Microsoft YaHei", sans-serif'
      卡片.style.color = 'white'
      卡片.style.background = 主题.背景
      卡片.style.border = `1px solid ${主题.强调色}`
      if (参数.阶段 === '步骤') {
        卡片.style.padding = '16px 20px'
        卡片.style.borderRadius = '12px'
      } else {
        卡片.style.padding = '22px 26px'
        卡片.style.borderRadius = '14px'
      }

      let 标题栏 = 卡片文档.createElement('div')
      标题栏.style.display = 'flex'
      标题栏.style.alignItems = 'center'
      标题栏.style.justifyContent = 'space-between'
      标题栏.style.marginBottom = '8px'
      标题栏.style.gap = '12px'
      let 标题 = 卡片文档.createElement('strong')
      标题.textContent = 参数.标题 ?? 主题.标题
      标题.style.fontSize = 参数.阶段 === '步骤' ? '16px' : '18px'
      标题.style.fontWeight = '700'
      标题.style.color = 主题.强调色
      标题栏.append(标题)
      if (主题.徽章 !== undefined) {
        let 徽章 = 卡片文档.createElement('span')
        徽章.textContent = 主题.徽章
        徽章.style.fontSize = '12px'
        徽章.style.padding = '2px 8px'
        徽章.style.borderRadius = '999px'
        徽章.style.whiteSpace = 'nowrap'
        徽章.style.background = 'rgba(255, 255, 255, 0.1)'
        徽章.style.color = 主题.强调色
        徽章.style.border = `1px solid ${主题.强调色}`
        标题栏.append(徽章)
      }
      let 内容 = 卡片文档.createElement('p')
      内容.textContent = 参数.说明
      内容.style.margin = '10px 0 16px'
      内容.style.whiteSpace = 'pre-wrap'
      内容.style.color = '#f1f5f9'
      内容.style.fontSize = 参数.阶段 === '步骤' ? '14px' : '15px'
      卡片.append(标题栏, 内容)

      let 交互 = {
        更新卡片高度(): void {
          卡片框.style.height = `${String(Math.ceil(卡片.getBoundingClientRect().height))}px`
        },
        结束(): void {
          高度监听.disconnect()
          卡片框.remove()
          if (原焦点 instanceof HTMLElement && 原焦点.isConnected === true) 原焦点.focus({ preventScroll: true })
          完成等待()
        },
        处理按键(事件: KeyboardEvent): void {
          if (事件.key === 'Enter') {
            事件.preventDefault()
            交互.结束()
          }
        },
        创建按钮(文字: string, 背景: string): HTMLButtonElement {
          let 按钮 = 卡片文档.createElement('button')
          按钮.type = 'button'
          按钮.textContent = 文字
          按钮.style.flex = '1'
          按钮.style.width = '100%'
          按钮.style.padding = '10px 16px'
          按钮.style.border = '0'
          按钮.style.borderRadius = '8px'
          按钮.style.background = 背景
          按钮.style.color = 'white'
          按钮.style.cursor = 'pointer'
          按钮.style.fontWeight = '600'
          按钮.style.fontSize = '14px'
          按钮.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.25)'
          按钮.onclick = 交互.结束
          return 按钮
        },
      }
      let 按钮栏 = 卡片文档.createElement('div')
      按钮栏.style.display = 'flex'
      按钮栏.style.gap = '12px'
      let 继续按钮 = 交互.创建按钮(主题.按钮文字, 主题.按钮背景)
      按钮栏.append(继续按钮)
      卡片.append(按钮栏)

      let 活跃指针: number | undefined
      let 水平偏移 = 0
      let 垂直偏移 = 0
      let 边距 = 8
      标题栏.title = '拖动此处移动弹框'
      标题栏.style.cursor = 'grab'
      标题栏.style.userSelect = 'none'
      标题栏.style.touchAction = 'none'
      let 拖动 = {
        结束(事件: PointerEvent): void {
          if (活跃指针 !== 事件.pointerId) return
          if (标题栏.hasPointerCapture(事件.pointerId) === true) 标题栏.releasePointerCapture(事件.pointerId)
          活跃指针 = undefined
          标题栏.style.cursor = 'grab'
        },
      }
      标题栏.onpointerdown = (事件): void => {
        if (事件.button !== 0) return
        let 位置 = 卡片框.getBoundingClientRect()
        活跃指针 = 事件.pointerId
        水平偏移 = 事件.clientX
        垂直偏移 = 事件.clientY
        卡片框.style.left = `${String(位置.left)}px`
        卡片框.style.top = `${String(位置.top)}px`
        卡片框.style.right = 'auto'
        卡片框.style.bottom = 'auto'
        卡片框.style.transform = 'none'
        标题栏.style.cursor = 'grabbing'
        标题栏.setPointerCapture(事件.pointerId)
        事件.preventDefault()
      }
      标题栏.onpointermove = (事件): void => {
        if (活跃指针 !== 事件.pointerId) return
        let 位置 = 卡片框.getBoundingClientRect()
        let 最大水平 = Math.max(边距, window.innerWidth - 位置.width - 边距)
        let 最大垂直 = Math.max(边距, window.innerHeight - 位置.height - 边距)
        卡片框.style.left = `${String(Math.min(Math.max(边距, 位置.left + 事件.clientX - 水平偏移), 最大水平))}px`
        卡片框.style.top = `${String(Math.min(Math.max(边距, 位置.top + 事件.clientY - 垂直偏移), 最大垂直))}px`
      }
      标题栏.onpointerup = 拖动.结束
      标题栏.onpointercancel = 拖动.结束

      卡片文档.body.append(卡片)
      交互.更新卡片高度()
      let 高度监听 = new ResizeObserver(交互.更新卡片高度)
      高度监听.observe(卡片)
      卡片文档.addEventListener('keydown', 交互.处理按键)
      继续按钮.focus({ preventScroll: true })
    })
  }
}
