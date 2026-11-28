import { 动作未执行错误, 是动作未执行错误 } from './action-phase'

/** 把「动作还没发出」阶段的错误转成 动作未执行错误（保留原消息、cause 链和 code），已经是的原样返回。 */
export function 转为动作未执行(错误: unknown): unknown {
  if (是动作未执行错误(错误)) return 错误
  let 新错误 = new 动作未执行错误(错误 instanceof Error ? 错误.message : String(错误), { cause: 错误 })
  if (错误 instanceof Error && 'code' in 错误) Reflect.set(新错误, 'code', 错误.code)
  return 新错误
}

/** 执行「定位、等稳、被盖住」这类还没真正发出动作的步骤，失败一律算动作没执行。 */
export async function 动作前执行<T>(执行: () => Promise<T>): Promise<T> {
  try {
    return await 执行()
  } catch (错误) {
    throw 转为动作未执行(错误)
  }
}
