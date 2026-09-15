import type { Page } from '@playwright/test'

export type 演示弹框窗口 = Window & {
  __e2eDemoGateElement?: HTMLElement
  __e2eDemoInstallDrag?: (弹框: HTMLElement, 拖动手柄: HTMLElement) => void
}

export async function 准备演示弹框拖动(page: Page): Promise<void> {
  await page.evaluate((): void => {
    let 当前窗口 = window as 演示弹框窗口
    当前窗口.__e2eDemoInstallDrag = (弹框, 拖动手柄): void => {
      let 活跃指针: number | undefined
      let 水平偏移 = 0
      let 垂直偏移 = 0
      let 边距 = 8

      拖动手柄.title = '拖动此处移动弹框'
      拖动手柄.style.cursor = 'grab'
      拖动手柄.style.userSelect = 'none'
      拖动手柄.style.touchAction = 'none'

      let 结束拖动 = (event: PointerEvent): void => {
        if (活跃指针 !== event.pointerId) return
        if (拖动手柄.hasPointerCapture(event.pointerId)) 拖动手柄.releasePointerCapture(event.pointerId)
        活跃指针 = undefined
        拖动手柄.style.cursor = 'grab'
      }

      拖动手柄.onpointerdown = (event): void => {
        if (event.button !== 0) return
        let 弹框位置 = 弹框.getBoundingClientRect()
        活跃指针 = event.pointerId
        水平偏移 = event.clientX - 弹框位置.left
        垂直偏移 = event.clientY - 弹框位置.top
        弹框.style.left = `${String(弹框位置.left)}px`
        弹框.style.top = `${String(弹框位置.top)}px`
        弹框.style.right = 'auto'
        弹框.style.bottom = 'auto'
        弹框.style.transform = 'none'
        拖动手柄.style.cursor = 'grabbing'
        拖动手柄.setPointerCapture(event.pointerId)
        event.preventDefault()
      }

      拖动手柄.onpointermove = (event): void => {
        if (活跃指针 !== event.pointerId) return
        let 弹框位置 = 弹框.getBoundingClientRect()
        let 最大水平位置 = Math.max(边距, window.innerWidth - 弹框位置.width - 边距)
        let 最大垂直位置 = Math.max(边距, window.innerHeight - 弹框位置.height - 边距)
        let 水平位置 = Math.min(Math.max(边距, event.clientX - 水平偏移), 最大水平位置)
        let 垂直位置 = Math.min(Math.max(边距, event.clientY - 垂直偏移), 最大垂直位置)
        弹框.style.left = `${String(水平位置)}px`
        弹框.style.top = `${String(垂直位置)}px`
      }

      拖动手柄.onpointerup = 结束拖动
      拖动手柄.onpointercancel = 结束拖动
    }
  })
}
