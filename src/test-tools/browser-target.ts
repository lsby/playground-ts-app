import type { Locator } from '@playwright/test'

export class 浏览器目标歧义错误 extends Error {
  public readonly code = 'BROWSER_TARGET_AMBIGUOUS'
}

/** 保留零匹配时 Playwright 的条件等待，提前指出已经存在的歧义。 */
export async function 检查目标唯一性(目标: Locator): Promise<void> {
  let 数量 = await 目标.count()
  if (数量 <= 1) return
  let 候选们 = await 目标.evaluateAll((元素们): string[] =>
    元素们.slice(0, 5).map((元素): string => 元素.outerHTML.slice(0, 350)),
  )
  throw new 浏览器目标歧义错误(
    `浏览器目标匹配了 ${String(数量)} 个元素：${目标.toString()}。请用 within 限定区域，或补充唯一角色/标签/选择器；不要用 first() 掩盖歧义。候选：\n${候选们.join('\n')}`,
  )
}
