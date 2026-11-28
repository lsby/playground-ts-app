import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * 一次工具调用里「动作是否已经执行」的明确标记，供录制判断失败后有没有副作用。
 * 引擎在真正调用设备或页面执行动作之前抛错时，抛出 动作未执行错误；在动作已经发出之后，调用 标记动作已执行()。
 * 不靠匹配错误文字判断。
 */
export class 动作未执行错误 extends Error {
  public constructor(消息: string, 选项?: ErrorOptions) {
    super(消息, 选项)
    this.name = '动作未执行错误'
  }
}

type 动作阶段记录 = { 动作已执行: boolean }
let 存储 = new AsyncLocalStorage<动作阶段记录>()

/** 在一个新的动作阶段记录里运行调用，调用内部（含它启动的异步任务）都能读写同一份标记。 */
export function 运行于动作阶段记录<T>(调用: () => T): { 记录: 动作阶段记录; 结果: T } {
  let 记录: 动作阶段记录 = { 动作已执行: false }
  return { 记录, 结果: 存储.run(记录, 调用) }
}

/** 动作已经发给设备或页面（之后再失败，动作可能已经生效）。不在录制调用里时什么都不做。 */
export function 标记动作已执行(): void {
  let 记录 = 存储.getStore()
  if (记录 !== undefined) 记录.动作已执行 = true
}

/** 沿 cause 链判断是否是明确的「动作没有执行」错误。 */
export function 是动作未执行错误(错误: unknown): boolean {
  let 已见 = new Set<unknown>()
  let 当前: unknown = 错误
  while (当前 instanceof Error && 已见.has(当前) === false) {
    if (当前 instanceof 动作未执行错误) return true
    已见.add(当前)
    当前 = 当前.cause
  }
  return false
}
