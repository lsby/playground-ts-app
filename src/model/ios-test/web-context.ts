import { z } from 'zod'

import type { Appium会话 } from './appium'

export type 网页上下文信息 = { id: string; url?: string | null | undefined }

/** 只留下属于本应用页面的 WEBVIEW 上下文：id 以 WEBVIEW 开头，地址以应用的网页地址前缀开头（同 origin 下的任何页面都算）。 */
export function 筛选网页上下文(上下文们: readonly 网页上下文信息[], 网页地址前缀: string): string[] {
  return 上下文们
    .filter((值) => 值.id.startsWith('WEBVIEW') && (值.url ?? '').startsWith(网页地址前缀))
    .map((值) => 值.id)
}

/**
 * 整页换文档后，WebView 可能换成新的上下文编号，旧编号也可能短暂还在列表里。
 * 只有一个就用它；有多个时优先选和当前缓存不同的（新文档），都一样则选列表里最后一个。
 */
export function 选择网页上下文(候选们: readonly string[], 当前: string | undefined): string | undefined {
  if (候选们.length <= 1) return 候选们[0]
  let 新的 = 候选们.filter((编号) => 编号 !== 当前)
  return 新的.at(-1) ?? 候选们.at(-1)
}

let 上下文列表模型 = z.array(z.object({ id: z.string(), url: z.string().nullish() }))

async function 切换到当前网页上下文(
  会话: Appium会话,
  网页地址前缀: string,
  缓存: string | undefined,
  已在使用: string | undefined,
  原因?: unknown,
): Promise<string> {
  let 上下文们 = 上下文列表模型.parse(await 会话.执行脚本('mobile: getContexts', [{ waitForWebviewMs: 3000 }]))
  let 选中 = 选择网页上下文(筛选网页上下文(上下文们, 网页地址前缀), 缓存)
  if (选中 === undefined) throw new Error(`iOS 找不到地址以 ${网页地址前缀} 开头的 WebView 上下文`, { cause: 原因 })
  if (选中 === 已在使用) return 选中
  try {
    await 会话.请求('POST', '/context', { name: 选中 })
  } catch (错误) {
    throw new AggregateError(
      [原因, 错误].filter((值) => 值 !== undefined),
      `iOS 切换到 WebView 上下文 ${选中} 失败`,
    )
  }
  return 选中
}

/**
 * 读页面地址（location.href）。整页换文档（如跳到 /terms/）后 WebView 的上下文编号可能变了，
 * 所以每次先重新列出上下文，和正在使用的不同就切过去；读取失败时强制重新切换再读一次。
 * 返回地址和读取时所在的上下文编号，调用方据此更新缓存。
 */
export async function 读取网页地址(
  会话: Appium会话,
  网页地址前缀: string,
  缓存: string | undefined,
  已在使用: string | undefined,
): Promise<{ 地址: string; 上下文: string }> {
  let 上下文 = await 切换到当前网页上下文(会话, 网页地址前缀, 缓存, 已在使用)
  try {
    return { 地址: z.string().parse(await 会话.执行脚本('return location.href')), 上下文 }
  } catch (错误) {
    let 新上下文 = await 切换到当前网页上下文(会话, 网页地址前缀, 上下文, undefined, 错误)
    return { 地址: z.string().parse(await 会话.执行脚本('return location.href')), 上下文: 新上下文 }
  }
}
