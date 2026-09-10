import { Locator, Page, test } from '@playwright/test'

// 演示模式控制变量
export let 演示模式 = process.env['DEMO_MODE'] === 'true'

export function 设置演示模式(开启: boolean): void {
  演示模式 = 开启
}

export type 演示说明位置 = '居中' | '右下角'

export type 演示上下文参数 = {
  /** 自定义演示粒度。支持任意业务字符串（例如 '细致'、'宏观'、'静默'、'登录需求演示01专用粒度' 等）
   * 框架不限定死枚举，以支持高度灵活的场景划分与按上下文分支判断。
   * 粒度只用于表达调用方意图，框架不会解析或推断其含义。
   */
  粒度: string
  /** 当前上下文下是否跳过步骤说明弹窗。未指定时继承外层上下文。 */
  跳过步骤说明?: boolean
  /** 当前上下文下是否跳过操作动画与等待。未指定时继承外层上下文。 */
  跳过操作动画?: boolean
  /** 进入该上下文前，在右下角显示一次说明。 */
  进入说明?: string
}

export type 演示作用域配置 = string | (演示上下文参数 & { page?: Page })

let 演示上下文栈: 演示上下文参数[] = []

export function 获得当前演示上下文(): 演示上下文参数 | undefined {
  return 演示上下文栈[演示上下文栈.length - 1]
}

export function 获得当前演示粒度(): string | undefined {
  return 获得当前演示上下文()?.粒度
}

export async function 演示_作用域<T = void>(配置: 演示作用域配置, 执行: () => Promise<T>): Promise<T> {
  let 外层上下文 = 获得当前演示上下文()
  let 标准上下文: 演示上下文参数
  let 关联页面: Page | undefined

  if (typeof 配置 === 'string') {
    标准上下文 = {
      粒度: 配置,
      跳过步骤说明: 外层上下文?.跳过步骤说明 ?? false,
      跳过操作动画: 外层上下文?.跳过操作动画 ?? false,
    }
  } else {
    关联页面 = 配置.page
    标准上下文 = {
      粒度: 配置.粒度,
      跳过步骤说明: 配置.跳过步骤说明 ?? 外层上下文?.跳过步骤说明 ?? false,
      跳过操作动画: 配置.跳过操作动画 ?? 外层上下文?.跳过操作动画 ?? false,
      ...(配置.进入说明 === undefined ? {} : { 进入说明: 配置.进入说明 }),
    }
  }

  if (关联页面 !== undefined && 标准上下文.进入说明 !== undefined && 标准上下文.进入说明.trim() !== '') {
    await 演示_说明_右下角(关联页面, 标准上下文.进入说明)
  }

  演示上下文栈.push(标准上下文)
  try {
    return await 执行()
  } finally {
    演示上下文栈.pop()
  }
}

export async function 演示_说明(
  page: Page,
  message: string,
  位置: 演示说明位置 = '居中',
  标题文本?: string,
): Promise<void> {
  if (演示模式 === false) return
  if (位置 === '右下角') {
    let 当前上下文 = 获得当前演示上下文()
    if (当前上下文?.跳过步骤说明 === true) {
      return
    }
  }
  // 人工查看与确认所需的时间不应计入自动化测试超时。
  test.setTimeout(0)
  await page.evaluate(
    ({ 说明, 模式, 自定义标题 }) =>
      new Promise<void>((resolve) => {
        let 当前窗口 = window as Window & { __e2eDemoGateElement?: HTMLElement }
        当前窗口.__e2eDemoGateElement?.remove()

        let 卡片 = document.createElement('aside')
        当前窗口.__e2eDemoGateElement = 卡片
        卡片.id = 'e2e-demo-gate'
        卡片.setAttribute('role', 'dialog')
        卡片.setAttribute('aria-label', 模式 === '居中' ? '测试演示目标' : '演示步骤说明')
        卡片.style.position = 'fixed'
        卡片.style.zIndex = '999999'
        卡片.style.font = '15px/1.65 system-ui, "Microsoft YaHei", sans-serif'
        卡片.style.color = 'white'

        if (模式 === '右下角') {
          卡片.style.right = '24px'
          卡片.style.bottom = '24px'
          卡片.style.left = 'auto'
          卡片.style.top = 'auto'
          卡片.style.transform = 'none'
          卡片.style.width = 'min(380px, calc(100vw - 48px))'
          卡片.style.padding = '16px 20px'
          卡片.style.border = '1px solid rgba(96, 165, 250, 0.45)'
          卡片.style.borderRadius = '12px'
          卡片.style.background = 'rgba(15, 23, 42, 0.78)'
          卡片.style.backdropFilter = 'blur(12px)'
          卡片.style.boxShadow = '0 18px 48px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.06)'
        } else {
          // 居中为测试开场目标说明：采用专属的深紫蓝磨砂主题，与右下角步骤指引及绿色结束卡片区分
          卡片.style.left = '50%'
          卡片.style.top = '50%'
          卡片.style.right = 'auto'
          卡片.style.bottom = 'auto'
          卡片.style.transform = 'translate(-50%, -50%)'
          卡片.style.width = 'min(520px, calc(100vw - 48px))'
          卡片.style.padding = '22px 26px'
          卡片.style.border = '1px solid rgba(165, 180, 252, 0.55)'
          卡片.style.borderRadius = '14px'
          卡片.style.background = 'rgba(30, 27, 75, 0.86)'
          卡片.style.backdropFilter = 'blur(16px)'
          卡片.style.boxShadow = '0 24px 60px rgba(0, 0, 0, 0.5), 0 0 24px rgba(99, 102, 241, 0.3)'
        }

        let 标题容器 = document.createElement('div')
        标题容器.style.display = 'flex'
        标题容器.style.alignItems = 'center'
        标题容器.style.justifyContent = 'space-between'
        标题容器.style.marginBottom = 模式 === '居中' ? '8px' : '6px'

        let 标题 = document.createElement('strong')
        if (模式 === '居中') {
          标题.textContent = 自定义标题 ?? '🎯 测试演示目标'
          标题.style.fontSize = '18px'
          标题.style.fontWeight = '700'
          标题.style.color = '#c7d2fe'

          let 徽章 = document.createElement('span')
          徽章.textContent = '演示开场'
          徽章.style.fontSize = '12px'
          徽章.style.padding = '2px 8px'
          徽章.style.borderRadius = '999px'
          徽章.style.background = 'rgba(99, 102, 241, 0.25)'
          徽章.style.color = '#e0e7ff'
          徽章.style.border = '1px solid rgba(165, 180, 252, 0.45)'

          标题容器.append(标题, 徽章)
        } else {
          标题.textContent = 自定义标题 ?? '步骤指引'
          标题.style.fontSize = '16px'
          标题.style.fontWeight = '700'
          标题.style.letterSpacing = '0.5px'
          标题容器.append(标题)
        }

        let 内容 = document.createElement('p')
        内容.textContent = 说明
        内容.style.margin = 模式 === '居中' ? '10px 0 16px' : '8px 0 14px'
        内容.style.whiteSpace = 'pre-wrap'
        内容.style.color = 模式 === '居中' ? '#f1f5f9' : '#e2e8f0'
        内容.style.fontSize = 模式 === '居中' ? '15px' : '14px'

        let 继续按钮 = document.createElement('button')
        继续按钮.type = 'button'
        继续按钮.textContent = 模式 === '居中' ? '开始演示 (Enter)' : '继续演示 (Enter)'
        继续按钮.style.width = '100%'
        继续按钮.style.padding = 模式 === '居中' ? '10px 16px' : '8px 14px'
        继续按钮.style.border = '0'
        继续按钮.style.borderRadius = '8px'
        继续按钮.style.color = 'white'
        继续按钮.style.cursor = 'pointer'
        继续按钮.style.fontWeight = '600'
        继续按钮.style.fontSize = '14px'

        if (模式 === '居中') {
          继续按钮.style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)'
          继续按钮.style.boxShadow = '0 2px 10px rgba(99, 102, 241, 0.4)'
        } else {
          继续按钮.style.background = 'linear-gradient(135deg, #2563eb, #1d4ed8)'
          继续按钮.style.boxShadow = '0 2px 8px rgba(37, 99, 235, 0.35)'
        }

        继续按钮.onclick = (): void => {
          卡片.remove()
          delete 当前窗口.__e2eDemoGateElement
          resolve()
        }

        卡片.append(标题容器, 内容, 继续按钮)
        document.body.append(卡片)
        继续按钮.focus()
      }),
    { 说明: message, 模式: 位置, 自定义标题: 标题文本 },
  )
}

export async function 演示_开场(page: Page, message: string, 标题?: string): Promise<void> {
  await 演示_说明(page, message, '居中', 标题 ?? '🎯 测试演示目标')
}

export async function 演示_说明_居中(page: Page, message: string, 标题?: string): Promise<void> {
  await 演示_说明(page, message, '居中', 标题)
}

export async function 演示_说明_右下角(page: Page, message: string): Promise<void> {
  await 演示_说明(page, message, '右下角')
}

export async function 演示_完成(page: Page, message: string): Promise<void> {
  if (演示模式 === false) return
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
        卡片.setAttribute('aria-label', '演示步骤完成')
        卡片.style.position = 'fixed'
        卡片.style.zIndex = '999999'
        卡片.style.left = '50%'
        卡片.style.top = '50%'
        卡片.style.transform = 'translate(-50%, -50%)'
        卡片.style.width = 'min(500px, calc(100vw - 48px))'
        卡片.style.padding = '22px 26px'
        卡片.style.border = '1px solid rgba(52, 211, 153, 0.5)'
        卡片.style.borderRadius = '14px'
        卡片.style.background = 'rgba(6, 78, 59, 0.82)'
        卡片.style.backdropFilter = 'blur(14px)'
        卡片.style.color = 'white'
        卡片.style.boxShadow = '0 24px 60px rgba(0, 0, 0, 0.45), 0 0 20px rgba(16, 185, 129, 0.2)'
        卡片.style.font = '15px/1.6 system-ui, "Microsoft YaHei", sans-serif'

        let 标题容器 = document.createElement('div')
        标题容器.style.display = 'flex'
        标题容器.style.alignItems = 'center'
        标题容器.style.justifyContent = 'space-between'
        标题容器.style.marginBottom = '8px'

        let 标题 = document.createElement('strong')
        标题.textContent = '✅ 本阶段演示完成'
        标题.style.fontSize = '18px'
        标题.style.fontWeight = '700'
        标题.style.color = '#6ee7b7'

        let 标签 = document.createElement('span')
        标签.textContent = '已通过'
        标签.style.fontSize = '12px'
        标签.style.padding = '2px 8px'
        标签.style.borderRadius = '999px'
        标签.style.background = 'rgba(16, 185, 129, 0.2)'
        标签.style.color = '#a7f3d0'
        标签.style.border = '1px solid rgba(16, 185, 129, 0.4)'

        标题容器.append(标题, 标签)

        let 内容 = document.createElement('p')
        内容.textContent = 说明
        内容.style.margin = '8px 0 16px'
        内容.style.whiteSpace = 'pre-wrap'
        内容.style.color = '#ecfdf5'

        let 继续按钮 = document.createElement('button')
        继续按钮.type = 'button'
        继续按钮.textContent = '完成并继续 (Enter)'
        继续按钮.style.width = '100%'
        继续按钮.style.padding = '10px 16px'
        继续按钮.style.border = '0'
        继续按钮.style.borderRadius = '8px'
        继续按钮.style.background = 'linear-gradient(135deg, #059669, #047857)'
        继续按钮.style.color = 'white'
        继续按钮.style.cursor = 'pointer'
        继续按钮.style.fontWeight = '600'
        继续按钮.style.fontSize = '14px'
        继续按钮.style.boxShadow = '0 2px 10px rgba(5, 150, 105, 0.4)'

        继续按钮.onclick = (): void => {
          卡片.remove()
          delete 当前窗口.__e2eDemoGateElement
          resolve()
        }

        卡片.append(标题容器, 内容, 继续按钮)
        document.body.append(卡片)
        继续按钮.focus()
      }),
    message,
  )
}

export async function 演示_确认(page: Page, message: string): Promise<boolean> {
  if (演示模式 === false) {
    throw new Error(
      `当前步骤属于人工介入核验，只能在演示 (Demo) 模式下运行；非演示模式直接判定失败。\n提示内容: ${message}`,
    )
  }
  test.setTimeout(0)
  return await page.evaluate(
    (说明) =>
      new Promise<boolean>((resolve) => {
        let 当前窗口 = window as Window & { __e2eDemoGateElement?: HTMLElement }
        当前窗口.__e2eDemoGateElement?.remove()

        let 卡片 = document.createElement('aside')
        当前窗口.__e2eDemoGateElement = 卡片
        卡片.id = 'e2e-demo-confirm-gate'
        卡片.setAttribute('role', 'dialog')
        卡片.setAttribute('aria-label', '人工核验确认')
        卡片.style.position = 'fixed'
        卡片.style.zIndex = '999999'
        卡片.style.left = '50%'
        卡片.style.top = '50%'
        卡片.style.transform = 'translate(-50%, -50%)'
        卡片.style.width = 'min(520px, calc(100vw - 48px))'
        卡片.style.padding = '22px 26px'
        卡片.style.border = '1px solid rgba(245, 158, 11, 0.6)'
        卡片.style.borderRadius = '14px'
        卡片.style.background = 'rgba(15, 23, 42, 0.88)'
        卡片.style.backdropFilter = 'blur(16px)'
        卡片.style.color = 'white'
        卡片.style.boxShadow = '0 24px 60px rgba(0, 0, 0, 0.45), 0 0 20px rgba(245, 158, 11, 0.2)'
        卡片.style.font = '15px/1.6 system-ui, "Microsoft YaHei", sans-serif'

        let 标题容器 = document.createElement('div')
        标题容器.style.display = 'flex'
        标题容器.style.alignItems = 'center'
        标题容器.style.justifyContent = 'space-between'
        标题容器.style.marginBottom = '8px'

        let 标题 = document.createElement('strong')
        标题.textContent = '人工核验确认'
        标题.style.fontSize = '18px'
        标题.style.fontWeight = '700'
        标题.style.color = '#fbbf24'

        let 标签 = document.createElement('span')
        标签.textContent = '需人工核准'
        标签.style.fontSize = '12px'
        标签.style.padding = '2px 8px'
        标签.style.borderRadius = '999px'
        标签.style.background = 'rgba(245, 158, 11, 0.2)'
        标签.style.color = '#fde68a'
        标签.style.border = '1px solid rgba(245, 158, 11, 0.4)'

        标题容器.append(标题, 标签)

        let 内容 = document.createElement('p')
        内容.textContent = 说明
        内容.style.margin = '10px 0 18px'
        内容.style.whiteSpace = 'pre-wrap'
        内容.style.color = '#fef3c7'

        let 按钮容器 = document.createElement('div')
        按钮容器.style.display = 'flex'
        按钮容器.style.gap = '12px'

        let 通过按钮 = document.createElement('button')
        通过按钮.type = 'button'
        通过按钮.textContent = '是 / 通过 (Y)'
        通过按钮.style.flex = '1'
        通过按钮.style.padding = '10px 16px'
        通过按钮.style.border = '0'
        通过按钮.style.borderRadius = '8px'
        通过按钮.style.background = 'linear-gradient(135deg, #059669, #047857)'
        通过按钮.style.color = 'white'
        通过按钮.style.cursor = 'pointer'
        通过按钮.style.fontWeight = '600'
        通过按钮.style.fontSize = '14px'
        通过按钮.style.boxShadow = '0 2px 10px rgba(5, 150, 105, 0.4)'

        let 拒绝按钮 = document.createElement('button')
        拒绝按钮.type = 'button'
        拒绝按钮.textContent = '否 / 未通过 (N)'
        拒绝按钮.style.flex = '1'
        拒绝按钮.style.padding = '10px 16px'
        拒绝按钮.style.border = '0'
        拒绝按钮.style.borderRadius = '8px'
        拒绝按钮.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)'
        拒绝按钮.style.color = 'white'
        拒绝按钮.style.cursor = 'pointer'
        拒绝按钮.style.fontWeight = '600'
        拒绝按钮.style.fontSize = '14px'
        拒绝按钮.style.boxShadow = '0 2px 10px rgba(220, 38, 38, 0.4)'

        let 完成 = (结果: boolean): void => {
          window.removeEventListener('keydown', 按键处理)
          卡片.remove()
          delete 当前窗口.__e2eDemoGateElement
          resolve(结果)
        }

        let 按键处理 = (e: KeyboardEvent): void => {
          if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
            e.preventDefault()
            完成(true)
          } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
            e.preventDefault()
            完成(false)
          }
        }

        window.addEventListener('keydown', 按键处理)
        通过按钮.onclick = (): void => 完成(true)
        拒绝按钮.onclick = (): void => 完成(false)

        按钮容器.append(通过按钮, 拒绝按钮)
        卡片.append(标题容器, 内容, 按钮容器)
        document.body.append(卡片)
        通过按钮.focus()
      }),
    message,
  )
}

export async function 演示_动画(locator: Locator, color: string): Promise<void> {
  if (!演示模式) return
  let 当前上下文 = 获得当前演示上下文()
  if (当前上下文?.跳过操作动画 === true) {
    return
  }
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
  let 当前上下文 = 获得当前演示上下文()
  if (演示模式 && 当前上下文?.跳过操作动画 !== true) await locator.page().waitForTimeout(400)
}

export async function 演示_勾选(locator: Locator): Promise<void> {
  await 演示_动画(locator, 'rgb(255, 165, 0)')
  await locator.check()
}

export async function 演示_选择(locator: Locator, option: Parameters<Locator['selectOption']>[0]): Promise<void> {
  await 演示_动画(locator, 'rgb(0, 200, 0)')
  await locator.selectOption(option)
  let 当前上下文 = 获得当前演示上下文()
  if (演示模式 && 当前上下文?.跳过操作动画 !== true) await locator.page().waitForTimeout(400)
}
