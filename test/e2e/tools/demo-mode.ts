import { Locator, Page, test } from '@playwright/test'

// 演示模式控制变量
export let 演示模式 = process.env['DEMO_MODE'] === 'true'

export function 设置演示模式(开启: boolean): void {
  演示模式 = 开启
}

export async function 演示_说明(page: Page, message: string): Promise<void> {
  if (演示模式 === false) return
  // 人工查看与确认所需的时间不应计入自动化测试超时。
  test.setTimeout(0)
  await page.evaluate(
    (说明) =>
      new Promise<void>((resolve) => {
        let 当前窗口 = window as Window & { __e2eDemoGateElement?: HTMLElement }
        当前窗口.__e2eDemoGateElement?.remove()

        let 卡片 = document.createElement('aside')
        当前窗口.__e2eDemoGateElement = 卡片
        卡片.id = 'e2e-demo-gate'
        卡片.setAttribute('role', 'dialog')
        卡片.setAttribute('aria-label', '演示步骤说明')
        卡片.style.position = 'fixed'
        卡片.style.left = '50%'
        卡片.style.top = '10%'
        卡片.style.transform = 'translateX(-50%)'
        卡片.style.zIndex = '999999'
        卡片.style.width = 'min(520px, calc(100vw - 48px))'
        卡片.style.padding = '20px 24px'
        卡片.style.border = '1px solid #60a5fa'
        卡片.style.borderRadius = '12px'
        卡片.style.background = 'rgba(15, 23, 42, 0.96)'
        卡片.style.color = 'white'
        卡片.style.boxShadow = '0 18px 48px rgba(0, 0, 0, 0.45)'
        卡片.style.font = '16px/1.6 system-ui, "Microsoft YaHei", sans-serif'

        let 标题 = document.createElement('strong')
        标题.textContent = '演示步骤'
        标题.style.display = 'block'
        标题.style.fontSize = '20px'

        let 内容 = document.createElement('p')
        内容.textContent = 说明
        内容.style.margin = '12px 0 16px'
        内容.style.whiteSpace = 'pre-wrap'

        let 继续按钮 = document.createElement('button')
        继续按钮.type = 'button'
        继续按钮.textContent = '继续演示'
        继续按钮.style.width = '100%'
        继续按钮.style.padding = '10px 16px'
        继续按钮.style.border = '0'
        继续按钮.style.borderRadius = '8px'
        继续按钮.style.background = '#2563eb'
        继续按钮.style.color = 'white'
        继续按钮.style.cursor = 'pointer'
        继续按钮.style.fontWeight = '700'
        继续按钮.onclick = (): void => {
          卡片.remove()
          delete 当前窗口.__e2eDemoGateElement
          resolve()
        }

        卡片.append(标题, 内容, 继续按钮)
        document.body.append(卡片)
        继续按钮.focus()
      }),
    message,
  )
}

export async function 演示_动画(locator: Locator, color: string): Promise<void> {
  if (!演示模式) return
  await locator.evaluate((node: HTMLElement, col) => {
    let rect = node.getBoundingClientRect()
    let div = document.createElement('div')
    div.style.position = 'fixed'
    div.style.left = rect.left + 'px'
    div.style.top = rect.top + 'px'
    div.style.width = rect.width + 'px'
    div.style.height = rect.height + 'px'
    div.style.border = `4px solid ${col}`
    div.style.boxShadow = `0 0 15px ${col}`
    div.style.borderRadius = '4px'
    div.style.zIndex = '999998'
    div.style.pointerEvents = 'none'
    div.style.transition = 'all 0.3s'
    document.body.appendChild(div)

    let cursor = document.createElement('div')
    cursor.style.position = 'fixed'
    cursor.style.left = rect.left + rect.width / 2 + 'px'
    cursor.style.top = rect.top + rect.height / 2 + 'px'
    cursor.style.width = '30px'
    cursor.style.height = '30px'
    cursor.style.borderRadius = '50%'
    cursor.style.background = col.replace(')', ', 0.4)').replace('rgb', 'rgba')
    cursor.style.zIndex = '999999'
    cursor.style.pointerEvents = 'none'
    cursor.style.transform = 'translate(-50%, -50%) scale(2)'
    cursor.style.transition = 'transform 0.3s ease-out'
    document.body.appendChild(cursor)

    requestAnimationFrame(() => {
      cursor.style.transform = 'translate(-50%, -50%) scale(1)'
    })

    setTimeout(() => {
      div.remove()
      cursor.remove()
    }, 800)
  }, color)
  await locator.page().waitForTimeout(800)
}

export async function 演示_点击(locator: Locator): Promise<void> {
  await 演示_动画(locator, 'rgb(255, 0, 0)')
  await locator.click()
}

export async function 演示_输入(locator: Locator, text: string): Promise<void> {
  await 演示_动画(locator, 'rgb(0, 85, 255)')
  await locator.fill(text)
  if (演示模式) await locator.page().waitForTimeout(400)
}

export async function 演示_勾选(locator: Locator): Promise<void> {
  await 演示_动画(locator, 'rgb(255, 165, 0)')
  await locator.check()
}

export async function 演示_选择(locator: Locator, option: { label: string }): Promise<void> {
  await 演示_动画(locator, 'rgb(0, 200, 0)')
  await locator.selectOption(option)
  if (演示模式) await locator.page().waitForTimeout(400)
}
