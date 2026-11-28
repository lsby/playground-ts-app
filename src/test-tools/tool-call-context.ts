import { AsyncLocalStorage } from 'node:async_hooks'

/** 一次 MCP 工具调用的信息：工具名，以及调用方放弃（超时、取消）时会触发的信号。 */
export type 工具调用信息 = { 工具名: string; 信号: AbortSignal }

let 存储 = new AsyncLocalStorage<工具调用信息>()

/** 在工具调用信息里运行调用，调用内部（含它启动的异步任务）都能读到同一份信息。 */
export function 运行于工具调用<T>(信息: 工具调用信息, 调用: () => T): T {
  return 存储.run(信息, 调用)
}

/** 当前所在的工具调用；不在 MCP 工具调用里（回放、单元测试）返回 undefined。 */
export function 读取当前工具调用(): 工具调用信息 | undefined {
  return 存储.getStore()
}
