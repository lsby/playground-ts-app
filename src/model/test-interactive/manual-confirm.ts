import { Page, test } from '@playwright/test'

import { 演示模式 } from './demo-mode'
import { 准备演示弹框拖动, type 演示弹框窗口 } from './dialog-drag'

export type 人工核验结果 = { 通过: boolean; 附加说明?: string }

export async function 演示_确认(page: Page, message: string): Promise<人工核验结果> {
  if (演示模式 === false) {
    throw new Error(
      `需人工验收：当前步骤只能在演示 (Demo) 模式下由审核员确认；非演示模式直接判定失败。\n提示内容: ${message}`,
    )
  }
  test.setTimeout(0)
  await 准备演示弹框拖动(page)
  return await page.evaluate(
    (说明) =>
      new Promise<人工核验结果>((resolve) => {
        let 当前窗口 = window as 演示弹框窗口
        当前窗口.__e2eDemoGateElement?.remove()
        let 安装拖动 = 当前窗口.__e2eDemoInstallDrag
        if (安装拖动 === undefined) throw new Error('演示弹框拖动功能未准备')

        let 卡片 = document.createElement('aside')
        当前窗口.__e2eDemoGateElement = 卡片
        卡片.id = 'e2e-demo-confirm-gate'
        卡片.setAttribute('role', 'dialog')
        卡片.setAttribute('aria-label', '人工核验确认')
        卡片.style.position = 'fixed'
        卡片.style.boxSizing = 'border-box'
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
        内容.style.margin = '10px 0 14px'
        内容.style.whiteSpace = 'pre-wrap'
        内容.style.color = '#fef3c7'

        let 说明标签 = document.createElement('label')
        说明标签.htmlFor = 'e2e-demo-confirm-note'
        说明标签.textContent = '附加说明（选填）'
        说明标签.style.display = 'block'
        说明标签.style.marginBottom = '6px'
        说明标签.style.color = '#fde68a'
        说明标签.style.fontSize = '13px'
        说明标签.style.fontWeight = '600'

        let 说明输入 = document.createElement('textarea')
        说明输入.id = 'e2e-demo-confirm-note'
        说明输入.placeholder = '可记录异常、核验细节或通过依据'
        说明输入.rows = 3
        说明输入.style.boxSizing = 'border-box'
        说明输入.style.width = '100%'
        说明输入.style.marginBottom = '16px'
        说明输入.style.padding = '9px 11px'
        说明输入.style.border = '1px solid rgba(245, 158, 11, 0.45)'
        说明输入.style.borderRadius = '8px'
        说明输入.style.background = 'rgba(15, 23, 42, 0.7)'
        说明输入.style.color = 'white'
        说明输入.style.font = '14px/1.5 system-ui, "Microsoft YaHei", sans-serif'
        说明输入.style.resize = 'vertical'

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

        let 完成 = (通过: boolean): void => {
          window.removeEventListener('keydown', 按键处理)
          卡片.remove()
          delete 当前窗口.__e2eDemoGateElement
          let 附加说明 = 说明输入.value.trim()
          resolve({ 通过, ...(附加说明 === '' ? {} : { 附加说明 }) })
        }

        let 按键处理 = (e: KeyboardEvent): void => {
          if (e.target === 说明输入) return
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
        卡片.append(标题容器, 内容, 说明标签, 说明输入, 按钮容器)
        document.body.append(卡片)
        安装拖动(卡片, 标题容器)
        通过按钮.focus()
      }),
    message,
  )
}
