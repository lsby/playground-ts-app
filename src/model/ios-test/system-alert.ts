import { setTimeout as 等待 } from 'node:timers/promises'
import { z } from 'zod'

import { 动作前执行 } from '../../test-tools/action-guard'
import { 动作未执行错误, 标记动作已执行 } from '../../test-tools/action-phase'
import type { Appium会话 } from './appium'

export type 系统弹框信息 = { 文字: string; 按钮们: string[] }

/**
 * 读取当前系统弹框（通知权限、定位、相册等 iOS 系统级提示）的文字和按钮；没有弹框返回 undefined。
 * 系统弹框不在 App 的网页和原生无障碍树里，点屏幕坐标也会被它挡住，只能走 Appium 的 alert 接口。
 */
export async function 读取系统弹框(会话: Appium会话): Promise<系统弹框信息 | undefined> {
  try {
    let 按钮们 = z.array(z.string()).parse(await 会话.执行脚本('mobile: alert', [{ action: 'getButtons' }]))
    let 文字 = z.string().parse(await 会话.请求('GET', '/alert/text'))
    return { 文字, 按钮们 }
  } catch {
    return undefined
  }
}

/**
 * 点系统弹框的按钮：动作 accept 点接受类按钮，dismiss 点拒绝类按钮；给了 按钮文字 就点文字完全一致的那个。
 * 弹框可能晚一点才出现，最多等 超时毫秒；没出现时，仅当出现时 为 true 就什么也不做（权限已经决定过就不会再弹，回放里用它避免偶发失败），否则报错。
 * 返回是否点了。
 */
export async function 处理系统弹框(
  会话: Appium会话,
  选项: { 动作: 'accept' | 'dismiss'; 按钮文字?: string | undefined; 仅当出现时: boolean; 超时毫秒: number },
  取消信号: AbortSignal,
): Promise<boolean> {
  let 截止 = Date.now() + 选项.超时毫秒
  let 弹框 = await 动作前执行(() => 读取系统弹框(会话))
  while (弹框 === undefined && Date.now() < 截止) {
    await 等待(300, undefined, { signal: 取消信号 })
    弹框 = await 读取系统弹框(会话)
  }
  if (弹框 === undefined) {
    if (选项.仅当出现时) return false
    throw new 动作未执行错误(`iOS 等待系统弹框超时（${String(选项.超时毫秒)} 毫秒内没有出现）`)
  }
  if (选项.按钮文字 !== undefined && 弹框.按钮们.includes(选项.按钮文字) === false)
    throw new 动作未执行错误(`系统弹框里没有按钮「${选项.按钮文字}」，现有按钮：${弹框.按钮们.join('、')}`)
  标记动作已执行()
  await 会话.执行脚本('mobile: alert', [
    { action: 选项.动作, ...(选项.按钮文字 === undefined ? {} : { buttonLabel: 选项.按钮文字 }) },
  ])
  return true
}
