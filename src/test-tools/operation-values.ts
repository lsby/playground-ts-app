import type { 测试数据库值, 测试数据库写入结果 } from '../model/test-requirement'

type 数据库结果值 = string | number | null | { type: 'bigint' | 'blob'; value: string }

function 编码值(值: 测试数据库值): 数据库结果值 {
  if (typeof 值 === 'bigint') return { type: 'bigint', value: String(值) }
  if (值 instanceof Uint8Array) return { type: 'blob', value: Buffer.from(值).toString('base64') }
  if (typeof 值 === 'number' && Number.isFinite(值) === false)
    throw new Error('The query returned a numeric value that cannot be represented in JSON.')
  return 值
}

export function 整理数据库查询结果(
  结果: Record<string, 测试数据库值>[],
  maxRows?: number,
): { rows: Record<string, 数据库结果值>[]; rowCount: number; truncated: boolean } {
  let rows = 结果
    .slice(0, maxRows)
    .map((行) => Object.fromEntries(Object.entries(行).map(([列, 值]) => [列, 编码值(值)])))
  return { rows, rowCount: 结果.length, truncated: rows.length < 结果.length }
}

/** 录制时返回给测试方、回放时存进状态的写入结果，两处用同一个函数，保证断言对得上。 */
export function 整理数据库写入结果(结果: 测试数据库写入结果): { changes: number; lastInsertRowid?: string | number } {
  let { 影响行数, 最后插入编号 } = 结果
  if (最后插入编号 === undefined) return { changes: 影响行数 }
  return {
    changes: 影响行数,
    lastInsertRowid: typeof 最后插入编号 === 'bigint' ? 最后插入编号.toString() : 最后插入编号,
  }
}
