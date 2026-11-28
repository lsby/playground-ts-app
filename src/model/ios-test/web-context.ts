import { setTimeout as 等待 } from 'node:timers/promises'
import { z } from 'zod'

import type { Appium会话 } from './appium'

export type 网页上下文信息 = { id: string; url?: string | null | undefined }

let 原生上下文名 = 'NATIVE_APP'
/** 报这个说明 Appium 连的是已经不存在的页面（旧进程残留）。 */
export function 是网页页面丢失错误(错误: unknown): boolean {
  return /No targets found/iu.test(错误 instanceof Error ? 错误.message : String(错误))
}

/**
 * 从 Appium 的上下文编号里取出页面所属的进程号。编号形如 `WEBVIEW_<进程号>.<页面号>`（也兼容 `WEBVIEW_PID:<进程号>.<页面号>`），
 * 不是这个格式（NATIVE_APP、别的写法）返回 undefined。
 */
export function 解析上下文进程号(编号: string): number | undefined {
  let 匹配 = /^WEBVIEW_(?:PID:)?(\d+)(?:\.\d+)?$/u.exec(编号)
  return 匹配?.[1] === undefined ? undefined : Number(匹配[1])
}

/**
 * 只留下属于本应用页面的 WEBVIEW 上下文：id 以 WEBVIEW 开头，地址以应用的网页地址前缀开头（同 origin 下的任何页面都算）。
 * 给了当前进程号时，还要求编号里的进程号等于它：模拟器的网页调试服务会继续列出已经退出的旧进程的页面，连上去只会报 No targets found。
 * 没给进程号时不按进程过滤。
 */
export function 筛选网页上下文(
  上下文们: readonly 网页上下文信息[],
  网页地址前缀: string,
  当前进程号?: number | undefined,
): string[] {
  return 上下文们
    .filter(
      (值) =>
        值.id.startsWith('WEBVIEW') &&
        (值.url ?? '').startsWith(网页地址前缀) &&
        (当前进程号 === undefined || 解析上下文进程号(值.id) === 当前进程号),
    )
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

/** 找不到当前进程的页面时的报错：写明当前进程号和 Appium 列出的全部上下文，方便判断是进程换了还是页面没起来。 */
export function 描述找不到网页上下文(
  网页地址前缀: string,
  当前进程号: number | undefined,
  上下文们: readonly 网页上下文信息[],
): string {
  let 候选 = 上下文们.map((值) => `${值.id}（${值.url ?? '无地址'}）`).join('、')
  return `iOS 找不到当前应用进程 ${当前进程号 === undefined ? '（未取到，应用可能没在运行）' : String(当前进程号)} 的 WebView 上下文（地址需以 ${网页地址前缀} 开头）。Appium 列出的上下文：${候选 === '' ? '无' : 候选}`
}

let 上下文列表模型 = z.array(z.object({ id: z.string(), url: z.string().nullish() }))

export type 网页上下文解析选项 = {
  会话: Appium会话
  网页地址前缀: string
  /** 取当前应用进程号；强制为 true 时忽略缓存重新读取（应用可能刚重启） */
  取进程号: (强制: boolean) => Promise<number | undefined>
  缓存: string | undefined
  取消信号: AbortSignal
  超时毫秒: number
  原因?: unknown
}

/**
 * 找到当前应用进程的 WebView 上下文编号。只认编号里进程号等于当前进程的页面；
 * 一时没有就等一下、重新取进程号再列，绝不退回旧进程的页面；超时报错带当前进程号和候选上下文。
 */
export async function 解析网页上下文(选项: 网页上下文解析选项): Promise<string> {
  let 截止 = Date.now() + 选项.超时毫秒
  let 强制 = false
  while (true) {
    选项.取消信号.throwIfAborted()
    let 进程号 = await 选项.取进程号(强制)
    let 上下文们 = 上下文列表模型.parse(await 选项.会话.执行脚本('mobile: getContexts', [{ waitForWebviewMs: 3000 }]))
    let 选中 = 选择网页上下文(筛选网页上下文(上下文们, 选项.网页地址前缀, 进程号), 选项.缓存)
    if (选中 !== undefined) return 选中
    if (Date.now() > 截止)
      throw new Error(描述找不到网页上下文(选项.网页地址前缀, 进程号, 上下文们), { cause: 选项.原因 })
    强制 = true
    await 等待(500, undefined, { signal: 选项.取消信号 })
  }
}

/**
 * 切到 WebView 上下文，返回实际使用的编号。已经在目标上下文时不重复切换。
 * 切换报 No targets found（连到了已经不存在的页面）时：先切回 NATIVE_APP，清掉缓存重新解析，再试，最多重试 2 次；
 * 其他错误直接抛出。`重新解析` 每次都应重新取进程号。
 */
export async function 切换到网页上下文(
  会话: Appium会话,
  重新解析: () => Promise<string>,
  已在使用: string | undefined,
  清缓存: () => void,
  原因?: unknown,
): Promise<string> {
  let 当前已在使用 = 已在使用
  for (let 次数 = 0; ; 次数++) {
    let 选中 = await 重新解析()
    if (选中 === 当前已在使用) return 选中
    try {
      await 会话.请求('POST', '/context', { name: 选中 })
      return 选中
    } catch (错误) {
      if (次数 >= 2 || 是网页页面丢失错误(错误) === false)
        throw new AggregateError(
          [原因, 错误].filter((值) => 值 !== undefined),
          `iOS 切换到 WebView 上下文 ${选中} 失败`,
        )
      try {
        await 会话.请求('POST', '/context', { name: 原生上下文名 })
      } catch {
        // 切回原生失败不影响后面重试
      }
      清缓存()
      当前已在使用 = 原生上下文名
    }
  }
}

/**
 * 读页面地址（location.href）。整页换文档（如跳到 /terms/）后 WebView 的上下文编号可能变了，
 * 所以每次先重新解析上下文，和正在使用的不同就切过去；读取失败时强制重新切换再读一次。
 * 返回地址和读取时所在的上下文编号，调用方据此更新缓存。
 */
export async function 读取网页地址(
  会话: Appium会话,
  解析选项: Omit<网页上下文解析选项, '会话' | '缓存' | '原因'>,
  缓存: string | undefined,
  已在使用: string | undefined,
  清缓存: () => void,
): Promise<{ 地址: string; 上下文: string }> {
  let 取得 = (缓存值: string | undefined, 原因?: unknown) => async (): Promise<string> =>
    await 解析网页上下文({ ...解析选项, 会话, 缓存: 缓存值, ...(原因 === undefined ? {} : { 原因 }) })
  let 上下文 = await 切换到网页上下文(会话, 取得(缓存), 已在使用, 清缓存)
  try {
    return { 地址: z.string().parse(await 会话.执行脚本('return location.href')), 上下文 }
  } catch (错误) {
    let 新上下文 = await 切换到网页上下文(会话, 取得(上下文, 错误), undefined, 清缓存, 错误)
    return { 地址: z.string().parse(await 会话.执行脚本('return location.href')), 上下文: 新上下文 }
  }
}
