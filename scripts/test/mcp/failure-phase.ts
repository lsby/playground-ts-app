import type { 失败阶段 } from '../../../src/model/test-requirement/recording'

/** 失败时收集到的线索：错误本身是否明确说明动作没执行，以及引擎是否标记过动作已执行。 */
export type 失败线索 = { 明确未执行: boolean; 动作已执行: boolean }

let 只读工具格式 = /^(?:browser|android|ios)_(?:wait|wait_url|inspect\w*|screenshot|list|observe)$/u
let 只读工具们 = new Set(['database_query', 'database_schema', 'backend_logs', 'browser_request_wait'])
export function 是只读工具(名称: string, 只读提示: boolean): boolean {
  return 只读提示 || 只读工具们.has(名称) || 只读工具格式.test(名称)
}

/**
 * 判断一次失败的调用发生在动作之前还是之后。顺序：
 * 1. 错误明确说动作没执行 -> 之前；
 * 2. 引擎标记过动作已执行 -> 之后；
 * 3. 只读工具（等待、检查、截图、查询）-> 之前，因为本来就没有动作；
 * 4. 其他动作无法确定 -> 之后，交给测试方确认。
 */
export function 判定失败阶段(工具名: string, 只读提示: boolean, 线索: 失败线索): 失败阶段 {
  if (线索.明确未执行) return 'before-action'
  if (线索.动作已执行) return 'after-action'
  if (是只读工具(工具名, 只读提示)) return 'before-action'
  return 'after-action'
}
