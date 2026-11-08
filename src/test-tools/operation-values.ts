import type { 测试数据库值 } from '../model/test-requirement'

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
