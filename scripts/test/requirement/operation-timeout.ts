import type { 操作调用条目 } from '../../../src/test-tools/operation-record'

/** 录制耗时含操作后的观察与取证；留一倍余量，不用该时长安排固定等待。 */
export function 推算回放超时(条目: 操作调用条目): number {
  let 显式超时 = 条目.arguments['timeoutMs']
  let 下限 =
    typeof 显式超时 === 'number' && Number.isSafeInteger(显式超时) && 显式超时 > 0 ? Math.max(10_000, 显式超时) : 10_000
  if (条目.status === 'pending') return 下限
  let 耗时 = Date.parse(条目.end) - Date.parse(条目.start)
  if (Number.isFinite(耗时) === false || 耗时 <= 0) return 下限
  let 推算 = Math.ceil((耗时 * 2) / 1000) * 1000
  if (Number.isSafeInteger(推算) === false) return 下限
  return Math.max(下限, 推算)
}
