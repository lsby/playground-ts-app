import { z } from 'zod'
import { 项目标识 } from '../../../app/meta-info'
import { 同步快照, 数据库快照, 数据库快照模式 } from '../../../model/local-first/sync-model'
import { 本地数据库Schema指纹 } from '../../../types/local-first-database-meta'
import { 是标准接口响应 } from './api-response'
import {
  写入本地优先状态,
  本地优先同步问题,
  本地优先同步问题解决器,
  本地优先状态,
  本地优先迁移失败项,
  读取本地优先状态,
} from './local-first-state'
import { 终止纯前端Worker, 请求纯前端Worker } from './pure-frontend-client'

export type 读取同步数据库对结果 =
  | { 状态: '成功'; 当前Schema指纹: string; 基线Schema指纹: string; 当前数据库: 数据库快照; 基线数据库: 数据库快照 }
  | { 状态: '迁移失败'; failures: 本地优先迁移失败项[] }

export async function 读取本地优先同步数据库对(状态: 本地优先状态, 表列表: string[]): Promise<读取同步数据库对结果> {
  let 结果 = await 请求纯前端Worker({
    command: 'read-sync-pair',
    databaseFileName: 状态.currentFileName,
    baselineFileName: 状态.baselineFileName,
    tables: 表列表,
  })
  if (是标准接口响应(结果) === false) throw new Error('读取本地优先数据库响应格式错误')
  if (结果.status === 'fail') {
    let 迁移失败 = z
      .object({
        code: z.literal('LOCAL_FIRST_MIGRATION_FAILED'),
        failures: z.array(
          z
            .object({ database: z.enum(['current', 'baseline']), fileName: z.string().min(1), message: z.string() })
            .strict(),
        ),
      })
      .strict()
      .safeParse(结果.data)
    if (迁移失败.success === true) return { 状态: '迁移失败', failures: 迁移失败.data.failures }
  }
  if (结果.status !== 'success') throw new Error(`读取本地优先数据库失败: ${JSON.stringify(结果.data)}`)
  let 数据库对 = z
    .object({
      当前Schema指纹: z.string(),
      基线Schema指纹: z.string(),
      当前数据库: 数据库快照模式,
      基线数据库: 数据库快照模式,
    })
    .strict()
    .parse(结果.data)
  return { 状态: '成功', ...数据库对 }
}

export async function 验证本地优先数据库(数据库: 数据库快照): Promise<void> {
  let 结果 = await 请求纯前端Worker({
    command: 'validate-snapshot',
    fileName: `${项目标识}-local-first-validation.db`,
    database: 数据库,
  })
  if (是标准接口响应(结果) === false || 结果.status !== 'success')
    throw new Error(是标准接口响应(结果) ? String(结果.data) : '数据库验证失败')
}

export async function 解决本地优先数据问题(
  问题解决器: 本地优先同步问题解决器,
  问题: Exclude<本地优先同步问题, { type: 'migration-failed' }>,
): Promise<数据库快照> {
  let 解决方案 = await 问题解决器(问题)
  switch (解决方案.action) {
    case 'use-database':
      return 数据库快照模式.parse(解决方案.database)
    case 'abort':
      throw new Error(`本地优先同步已取消: ${问题.type}`)
    case 'discard-and-reinitialize':
      throw new Error(`仅迁移失败时可以丢弃本地数据: ${问题.type}`)
  }
}

function 获得下一数据库槽位(
  已有状态: 本地优先状态 | undefined,
  默认文件名前缀: string,
): { 文件名前缀: string; 槽位: 'a' | 'b' } {
  if (已有状态 === undefined) return { 文件名前缀: 默认文件名前缀, 槽位: 'a' }
  for (let 槽位 of ['a', 'b'] as const) {
    let 当前后缀 = `-current-${槽位}.db`
    if (已有状态.currentFileName.endsWith(当前后缀) === false) continue
    let 文件名前缀 = 已有状态.currentFileName.slice(0, -当前后缀.length)
    if (已有状态.baselineFileName !== `${文件名前缀}-baseline-${槽位}.db`)
      throw new Error('本地优先当前库与基线库槽位不一致')
    return { 文件名前缀, 槽位: 槽位 === 'a' ? 'b' : 'a' }
  }
  throw new Error('本地优先数据库文件名不符合 A/B 槽位约定')
}

async function 创建本地优先文件名前缀(用户id: string): Promise<string> {
  let 摘要 = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${项目标识}\0${用户id}`))
  let 用户标识 = [...new Uint8Array(摘要).slice(0, 12)].map((字节) => 字节.toString(16).padStart(2, '0')).join('')
  let 代次标识 = [...crypto.getRandomValues(new Uint8Array(4))]
    .map((字节) => 字节.toString(16).padStart(2, '0'))
    .join('')
  return `lf-${用户标识}-${代次标识}`
}

export async function 采用本地优先权威快照(快照: 同步快照, 使用全新文件 = false): Promise<void> {
  if (快照.schemaFingerprint !== 本地数据库Schema指纹)
    throw new Error('服务器 Schema 与当前前端版本不一致，请先更新应用资源')
  let 已有状态 = 读取本地优先状态(快照.userId)
  let 默认文件名前缀 = await 创建本地优先文件名前缀(快照.userId)
  let 下一文件 =
    使用全新文件 === true
      ? { 文件名前缀: 默认文件名前缀, 槽位: 'a' as const }
      : 获得下一数据库槽位(已有状态, 默认文件名前缀)
  let 状态: 本地优先状态 = {
    currentFileName: `${下一文件.文件名前缀}-current-${下一文件.槽位}.db`,
    baselineFileName: `${下一文件.文件名前缀}-baseline-${下一文件.槽位}.db`,
    userId: 快照.userId,
    schemaFingerprint: 快照.schemaFingerprint,
    tables: Object.keys(快照.database).sort((左, 右) => 左.localeCompare(右)),
  }
  let 结果 = await 请求纯前端Worker({
    command: 'replace-sync-pair',
    currentFileName: 状态.currentFileName,
    baselineFileName: 状态.baselineFileName,
    database: 快照.database,
  })
  if (是标准接口响应(结果) === false || 结果.status !== 'success')
    throw new Error(`替换本地优先数据库失败: ${JSON.stringify(结果)}`)
  写入本地优先状态(状态)
  终止纯前端Worker()
}
