import { z } from 'zod'
import { 项目标识 } from '../../../app/meta-info'
import { 合并冲突, 数据库快照 } from '../../../model/local-first/sync-model'
import { 本地接口策略列表 } from '../../pure-frontend/local-api-policy'

export type 同步数据库副本 = { schemaFingerprint: string; database: 数据库快照 }
export type 本地优先迁移失败项 = { database: 'current' | 'baseline'; fileName: string; message: string }
type 本地优先数据问题上下文 = {
  remoteDatabase: 同步数据库副本
  baselineDatabase: 同步数据库副本
  localDatabase: 同步数据库副本
  targetSchemaFingerprint: string
}
export type 本地优先同步问题 =
  | { type: 'migration-failed'; userId: string; targetSchemaFingerprint: string; failures: 本地优先迁移失败项[] }
  | ({ type: 'data-conflict'; conflicts: 合并冲突[] } & 本地优先数据问题上下文)
  | ({ type: 'constraint-violation'; detail: string } & 本地优先数据问题上下文)
export type 本地优先同步解决方案 =
  | { action: 'discard-and-reinitialize' }
  | { action: 'use-database'; database: 数据库快照 }
  | { action: 'abort' }
export type 本地优先同步问题解决器 = (问题: 本地优先同步问题) => Promise<本地优先同步解决方案>
export type 本地优先同步失败处理器 = (错误: unknown) => Promise<void>

let 本地优先状态模式 = z
  .object({
    currentFileName: z.string().min(1),
    baselineFileName: z.string().min(1),
    userId: z.string().min(1),
    schemaFingerprint: z.string().min(1),
    tables: z.array(z.string().min(1)),
  })
  .strict()

export type 本地优先状态 = z.infer<typeof 本地优先状态模式>

let 本地优先状态表模式 = z.record(z.string(), 本地优先状态模式)

export let 本地优先状态键 = `${项目标识}-local-first-state-by-user`
let 当前标签页用户键 = `${项目标识}-local-first-active-user`

function 读取本地优先状态表(): Record<string, 本地优先状态> {
  let 内容 = localStorage.getItem(本地优先状态键)
  if (内容 === null) return {}
  let 状态表 = 本地优先状态表模式.parse(JSON.parse(内容))
  for (let [用户id, 状态] of Object.entries(状态表)) {
    if (状态.userId !== 用户id) throw new Error(`本地优先状态用户不一致: ${用户id}`)
  }
  return 状态表
}

export function 读取本地优先状态(用户id?: string): 本地优先状态 | undefined {
  let 目标用户id = 用户id ?? sessionStorage.getItem(当前标签页用户键)
  if (目标用户id === null) return undefined
  return 读取本地优先状态表()[目标用户id]
}

export function 写入本地优先状态(状态: 本地优先状态): void {
  let 已校验状态 = 本地优先状态模式.parse(状态)
  let 状态表 = 读取本地优先状态表()
  状态表[已校验状态.userId] = 已校验状态
  localStorage.setItem(本地优先状态键, JSON.stringify(状态表))
  sessionStorage.setItem(当前标签页用户键, 已校验状态.userId)
}

export function 删除本地优先状态(用户id: string): void {
  let 状态表 = 读取本地优先状态表()
  delete 状态表[用户id]
  localStorage.setItem(本地优先状态键, JSON.stringify(状态表))
  if (sessionStorage.getItem(当前标签页用户键) === 用户id) sessionStorage.removeItem(当前标签页用户键)
}

export function 停用本地优先状态(): void {
  sessionStorage.removeItem(当前标签页用户键)
}

export function 获得接口浏览器支持(路径: string, 方法: string): '纯前端' | '本地优先' | undefined {
  let pathname = new URL(路径, window.location.origin).pathname
  return 本地接口策略列表.find((项) => 项.路径 === pathname && 项.方法.toLowerCase() === 方法.toLowerCase())?.浏览器支持
}
