import { z } from 'zod'

export let 数据库标量模式 = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])
export let 数据库行模式 = z.record(z.string(), 数据库标量模式)
export let 数据库快照模式 = z.record(z.string(), z.array(数据库行模式))

export type 数据库标量 = z.infer<typeof 数据库标量模式>
export type 数据库行 = z.infer<typeof 数据库行模式>
export type 数据库快照 = z.infer<typeof 数据库快照模式>
export type 数据库主键表 = Record<string, string[]>

export let 同步快照模式 = z
  .object({
    schemaFingerprint: z.string().min(1),
    dataHash: z.string().regex(/^[0-9a-f]{64}$/),
    userId: z.string().min(1),
    database: 数据库快照模式,
  })
  .strict()

export type 同步快照 = z.infer<typeof 同步快照模式>

export type 合并冲突 = {
  表名: string
  主键: 数据库行
  字段名: string | null
  基线值: 数据库标量 | 数据库行 | null
  本地值: 数据库标量 | 数据库行 | null
  远程值: 数据库标量 | 数据库行 | null
}

export type 合并结果 = { 状态: '成功'; 数据库: 数据库快照 } | { 状态: '冲突'; 冲突列表: 合并冲突[] }

function 规范化值(值: 数据库标量 | 数据库行): string {
  if (typeof 值 !== 'object' || 值 === null) return JSON.stringify(值)
  let 键列表 = Object.keys(值).sort((左, 右) => 左.localeCompare(右))
  return `{${键列表.map((键) => `${JSON.stringify(键)}:${规范化值(值[键] ?? null)}`).join(',')}}`
}

export function 规范化数据库快照(数据库: 数据库快照): string {
  let 表列表 = Object.keys(数据库).sort((左, 右) => 左.localeCompare(右))
  return `{${表列表
    .map((表名) => {
      let 行列表 = 数据库[表名]
      if (行列表 === undefined) throw new Error(`数据库快照缺少表: ${表名}`)
      let 规范行列表 = 行列表.map((行) => 规范化值(行)).sort((左, 右) => 左.localeCompare(右))
      return `${JSON.stringify(表名)}:[${规范行列表.join(',')}]`
    })
    .join(',')}}`
}

export async function 计算数据库快照哈希(schemaFingerprint: string, 数据库: 数据库快照): Promise<string> {
  let 内容 = `${schemaFingerprint}\n${规范化数据库快照(数据库)}`
  let 摘要 = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(内容))
  return [...new Uint8Array(摘要)].map((字节) => 字节.toString(16).padStart(2, '0')).join('')
}

function 值相等(左: 数据库标量 | 数据库行 | undefined, 右: 数据库标量 | 数据库行 | undefined): boolean {
  if (左 === undefined || 右 === undefined) return 左 === 右
  return 规范化值(左) === 规范化值(右)
}

function 获得主键(表名: string, 行: 数据库行, 主键表: 数据库主键表): { 标识: string; 主键: 数据库行 } {
  let 主键字段列表 = 主键表[表名]
  if (主键字段列表 === undefined || 主键字段列表.length === 0) throw new Error(`本地优先同步表必须具有主键: ${表名}`)
  let 主键: 数据库行 = {}
  for (let 字段名 of 主键字段列表) {
    let 值 = 行[字段名]
    if (值 === undefined || 值 === null) throw new Error(`同步数据主键不完整: ${表名}.${字段名}`)
    主键[字段名] = 值
  }
  return { 标识: 规范化值(主键), 主键 }
}

function 构造行表(表名: string, 行列表: 数据库行[], 主键表: 数据库主键表): Map<string, 数据库行> {
  let 结果 = new Map<string, 数据库行>()
  for (let 行 of 行列表) {
    let { 标识 } = 获得主键(表名, 行, 主键表)
    if (结果.has(标识) === true) throw new Error(`同步数据包含重复主键: ${表名} ${标识}`)
    结果.set(标识, 行)
  }
  return 结果
}

function 合并完整行(
  表名: string,
  主键: 数据库行,
  基线行: 数据库行,
  本地行: 数据库行,
  远程行: 数据库行,
): { 行?: 数据库行; 冲突列表: 合并冲突[] } {
  let 结果: 数据库行 = {}
  let 冲突列表: 合并冲突[] = []
  let 字段列表 = [...new Set([...Object.keys(基线行), ...Object.keys(本地行), ...Object.keys(远程行)])].sort((左, 右) =>
    左.localeCompare(右),
  )
  for (let 字段名 of 字段列表) {
    let 基线值 = 基线行[字段名]
    let 本地值 = 本地行[字段名]
    let 远程值 = 远程行[字段名]
    if (值相等(本地值, 远程值) === true) {
      if (本地值 !== undefined) 结果[字段名] = 本地值
      continue
    }
    if (值相等(基线值, 本地值) === true) {
      if (远程值 !== undefined) 结果[字段名] = 远程值
      continue
    }
    if (值相等(基线值, 远程值) === true) {
      if (本地值 !== undefined) 结果[字段名] = 本地值
      continue
    }
    冲突列表.push({ 表名, 主键, 字段名, 基线值: 基线值 ?? null, 本地值: 本地值 ?? null, 远程值: 远程值 ?? null })
  }
  return 冲突列表.length === 0 ? { 行: 结果, 冲突列表 } : { 冲突列表 }
}

export function 三方合并数据库(远程: 数据库快照, 基线: 数据库快照, 本地: 数据库快照, 主键表: 数据库主键表): 合并结果 {
  let 结果: 数据库快照 = {}
  let 冲突列表: 合并冲突[] = []
  let 表列表 = [...new Set([...Object.keys(远程), ...Object.keys(基线), ...Object.keys(本地)])].sort((左, 右) =>
    左.localeCompare(右),
  )
  for (let 表名 of 表列表) {
    let 基线行表 = 构造行表(表名, 基线[表名] ?? [], 主键表)
    let 本地行表 = 构造行表(表名, 本地[表名] ?? [], 主键表)
    let 远程行表 = 构造行表(表名, 远程[表名] ?? [], 主键表)
    let 合并行列表: 数据库行[] = []
    let 行标识列表 = [...new Set([...基线行表.keys(), ...本地行表.keys(), ...远程行表.keys()])].sort((左, 右) =>
      左.localeCompare(右),
    )
    for (let 行标识 of 行标识列表) {
      let 基线行 = 基线行表.get(行标识)
      let 本地行 = 本地行表.get(行标识)
      let 远程行 = 远程行表.get(行标识)
      let 主键来源 = 基线行 ?? 本地行 ?? 远程行
      if (主键来源 === undefined) throw new Error(`无法获得同步行: ${表名} ${行标识}`)
      let { 主键 } = 获得主键(表名, 主键来源, 主键表)

      if (值相等(本地行, 远程行) === true) {
        if (本地行 !== undefined) 合并行列表.push(本地行)
        continue
      }
      if (值相等(基线行, 本地行) === true) {
        if (远程行 !== undefined) 合并行列表.push(远程行)
        continue
      }
      if (值相等(基线行, 远程行) === true) {
        if (本地行 !== undefined) 合并行列表.push(本地行)
        continue
      }
      if (基线行 !== undefined && 本地行 !== undefined && 远程行 !== undefined) {
        let 合并行结果 = 合并完整行(表名, 主键, 基线行, 本地行, 远程行)
        冲突列表.push(...合并行结果.冲突列表)
        if (合并行结果.行 !== undefined) 合并行列表.push(合并行结果.行)
        continue
      }
      冲突列表.push({
        表名,
        主键,
        字段名: null,
        基线值: 基线行 ?? null,
        本地值: 本地行 ?? null,
        远程值: 远程行 ?? null,
      })
    }
    结果[表名] = 合并行列表
  }
  return 冲突列表.length === 0 ? { 状态: '成功', 数据库: 结果 } : { 状态: '冲突', 冲突列表 }
}
