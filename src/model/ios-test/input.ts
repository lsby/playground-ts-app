import { z } from 'zod'
import type { Appium会话 } from './appium'
import { 输入框查询 } from './simctl'

let 元素标识模型 = z.object({ 'element-6066-11e4-a52e-4f735466cecf': z.string() })

/**
 * 找到获得焦点的原生输入框，整串一次 setValue。
 * 不用 mobile: keys 逐字符敲：每个字符都让 XCUITest 重新确认键盘，录屏看到键盘在输入中途反复收起、弹出。
 * 调用前要已切到 NATIVE_APP 上下文。
 */
export async function 向焦点输入框输入(会话: Appium会话, 文字: string): Promise<void> {
  let 候选们 = z.array(元素标识模型).parse(await 会话.请求('POST', '/elements', 输入框查询))
  for (let 候选 of 候选们) {
    let 标识 = 候选['element-6066-11e4-a52e-4f735466cecf']
    if ((await 会话.请求<string>('GET', `/element/${标识}/attribute/focused`)) !== 'true') continue
    await 会话.请求('POST', `/element/${标识}/value`, { text: 文字 })
    return
  }
  throw new Error('没有获得焦点的输入框，请先点击输入框')
}

/** 点坐标必须在屏幕内（单位是点）。 */
export function 检查点坐标(x: number, y: number, 窗口: { width: number; height: number }): void {
  if (
    Number.isFinite(x) === false ||
    Number.isFinite(y) === false ||
    x < 0 ||
    y < 0 ||
    x >= 窗口.width ||
    y >= 窗口.height
  )
    throw new Error(
      `iOS 坐标超出屏幕范围 ${String(窗口.width)}×${String(窗口.height)}（单位是点）：${String(x)}, ${String(y)}`,
    )
}
