import { isDeepStrictEqual } from 'node:util'

import type { JSON值 } from '../data/json-value'
import { 读取操作结果字段 } from './recording-result'
import type { 操作断言条目, 操作记录条目 } from './recording-types'

let 最大实际值文本长度 = 300

function 截断(文本: string): string {
  return 文本.length > 最大实际值文本长度 ? `${文本.slice(0, 最大实际值文本长度)}…（已截断）` : 文本
}

/**
 * 添加断言时核对：期望值（或 expectedFrom 指向的值）必须与来源操作录制时的实际结果深度相等，
 * 语义与回放用的 deepStrictEqual 一致。导出和读回录制文件时不调用。
 */
export function 核对断言期望(断言: 操作断言条目, 条目们: ReadonlyMap<number, 操作记录条目>): void {
  let 读取录制值 = (sourceId: number, path: readonly (string | number)[]): JSON值 => {
    let 来源 = 条目们.get(sourceId)
    if (来源 === undefined || 来源.kind !== 'call' || 来源.status !== 'passed')
      throw new Error(`找不到操作 #${String(sourceId)} 录下的结果`)
    return 读取操作结果字段(new Map([[sourceId, 来源.result]]), sourceId, path)
  }
  let 实际 = 读取录制值(断言.sourceId, 断言.path)
  let 期望 =
    断言.expectedFrom === undefined ? 断言.expected : 读取录制值(断言.expectedFrom.sourceId, 断言.expectedFrom.path)
  if (isDeepStrictEqual(实际, 期望)) return
  let 期望说明 = 断言.expectedFrom === undefined ? '期望值' : `操作 #${String(断言.expectedFrom.sourceId)} 的结果`
  let 实际文本 = JSON.stringify(实际)
  let 提示 = ''
  if (断言.expectedFrom === undefined && typeof 期望 === 'string') {
    let 解开: unknown
    try {
      解开 = JSON.parse(期望)
    } catch {
      解开 = undefined
    }
    if (解开 !== undefined && isDeepStrictEqual(解开, 实际))
      提示 = `；期望值多编码了一层引号，直接写 ${截断(实际文本)}（expected 是 JSON 值本身，不要再 JSON 编码）`
  }
  throw new Error(
    `断言 #${String(断言.id)} 的${期望说明}与操作 #${String(断言.sourceId)} 录制时的实际结果不一致，实际值（路径 ${JSON.stringify(断言.path)}）：${截断(实际文本)}${提示}`,
  )
}
