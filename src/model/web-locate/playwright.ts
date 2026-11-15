import type { Locator, Page } from '@playwright/test'

import type { 定位候选, 落点探测结果 } from './candidates'
import { 整理落点结果, 视口模型 } from './probe'
import { 清理脚本, 落点脚本, 读取视口脚本 } from './scripts'

/** 在页面里执行函数体脚本（与 Appium executeScript 同一种写法：参数在 arguments 里）。 */
export async function 执行页面脚本(页面: Page, 脚本: string, 参数们: readonly unknown[] = []): Promise<unknown> {
  return await 页面.evaluate(`(function () { ${脚本} }).apply(null, ${JSON.stringify(参数们)})`)
}

export async function 读取页面视口(页面: Page): Promise<{ 宽: number; 高: number }> {
  return 视口模型.parse(await 执行页面脚本(页面, 读取视口脚本))
}

function 候选定位(页面: Page, 候选: 定位候选): Locator {
  return 候选.种类 === '文字' ? 页面.getByText(候选.值, { exact: true }) : 页面.locator(`css=${候选.值}`)
}

/** 候选匹配到的元素就是落点元素：选择器要求就是它，文字匹配到的是含该文字的最深元素，允许是落点元素的后代。 */
async function 是落点元素(定位: Locator, 允许后代: boolean): Promise<boolean> {
  return await 定位.evaluate((元素, 后代也算) => {
    let 目标: unknown = Reflect.get(window, '__ntProbeTarget')
    let 节点: Node | null = 元素
    while (节点 !== null) {
      if (节点 === 目标) return true
      if (后代也算 === false) return false
      let 宿主: unknown = Reflect.get(节点, 'host')
      节点 = 节点.parentNode ?? (宿主 instanceof Node ? 宿主 : null)
    }
    return false
  }, 允许后代)
}

/**
 * 页面（CSS 视口）坐标处的落点识别：找到落点元素，生成候选，用 Playwright 的真实定位器当场验证
 * 「只匹配到一个，而且就是这个元素」，返回第一个通过的候选。Android 和浏览器共用。
 */
export async function 探测页面落点(页面: Page, 点: { x: number; y: number }): Promise<落点探测结果> {
  try {
    return await 整理落点结果(await 执行页面脚本(页面, 落点脚本, [点.x, 点.y]), async (候选们) => {
      for (let 候选 of 候选们) {
        try {
          let 定位 = 候选定位(页面, 候选)
          if ((await 定位.count()) !== 1) continue
          if (await 是落点元素(定位, 候选.种类 === '文字')) return 候选
        } catch {
          // 候选的写法在这个引擎里不能解析时，换下一个
        }
      }
      return undefined
    })
  } finally {
    await 执行页面脚本(页面, 清理脚本).catch((): void => {})
  }
}
