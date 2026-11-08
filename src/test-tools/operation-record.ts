import { randomUUID } from 'node:crypto'
import { lstat, open, rename, rm } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import { JSON值模式, type JSON值 } from '../model/json-value'

export type { JSON值 } from '../model/json-value'
export type JSON对象 = { [键: string]: JSON值 }

type 证据文件 = { path: string; description?: string }
type 调用结论 = { status: 'passed'; result: JSON对象 } | { status: 'failed'; error: string }
export type 操作调用结果 = 调用结论 & { artifacts: readonly 证据文件[]; evidenceErrors: readonly string[] }

type 基本条目 = { id: number; notes: string | null; decision?: string | null }
type 调用条目主体 = 基本条目 & { kind: 'call'; tool: string; arguments: JSON对象; start: string }
type 完成字段 = 调用结论 & { end: string; artifacts: 证据文件[]; evidenceErrors: string[] }
export type 操作调用条目 = 调用条目主体 & ({ status: 'pending' } | 完成字段)
export type 操作断言条目 = 基本条目 & {
  kind: 'assertion'
  sourceId: number
  path: Array<string | number>
  operator: 'deepEqual'
  expected: JSON值
  createdAt: string
}
export type 操作记录条目 = 操作调用条目 | 操作断言条目
export type 操作记录摘要 =
  | (Pick<操作调用条目, 'id' | 'kind' | 'tool' | 'status' | 'start' | 'notes' | 'decision'> & { end?: string })
  | Omit<操作断言条目, 'expected'>

type 操作记录文档 = { version: 1; nextId: number; entries: readonly 操作记录条目[] }
let 结果路径模式 = z.array(z.union([z.string(), z.number().int().nonnegative().safe()]))

function 复制JSON<T extends JSON值>(值: T): T {
  let 副本 = structuredClone(值)
  JSON值模式.parse(副本)
  return 副本
}

function 生成摘要(条目: 操作记录条目): 操作记录摘要 {
  switch (条目.kind) {
    case 'call': {
      let { id, kind, notes, decision, tool, status, start } = 条目
      return {
        id,
        kind,
        notes,
        ...(decision === undefined ? {} : { decision }),
        tool,
        status,
        start,
        ...(条目.status === 'pending' ? {} : { end: 条目.end }),
      }
    }
    case 'assertion': {
      let { expected: _期望, path: 路径, ...摘要 } = 条目
      return { ...摘要, path: [...路径] }
    }
  }
}

function 检查索引(值: number, 名称: string, 最小值: number): void {
  if (Number.isSafeInteger(值) === false || 值 < 最小值)
    throw new Error(`${名称}必须是大于或等于 ${String(最小值)} 的安全整数`)
}

/** 开发套件内的一份有序操作记录，证据文件由运行工具独立管理。 */
export class 测试操作记录 {
  public readonly 文件路径: string
  private 文档: 操作记录文档 | undefined
  private 队列 = Promise.resolve()

  public constructor(输出目录: string) {
    if (path.isAbsolute(输出目录) === false) throw new Error('操作记录输出目录必须使用绝对路径')
    this.文件路径 = path.join(输出目录, 'operations.json')
  }

  public 初始化(): Promise<void> {
    return this.排队(async (): Promise<void> => {
      if (this.文档 !== undefined) return
      try {
        await lstat(this.文件路径)
        throw new Error(`操作记录已存在：${this.文件路径}`)
      } catch (错误) {
        if (错误 instanceof Error === false || 'code' in 错误 === false || 错误.code !== 'ENOENT') throw 错误
      }
      await this.提交({ version: 1, nextId: 1, entries: [] })
    })
  }

  public async 开始(工具: string, 参数: JSON对象): Promise<number> {
    let start = new Date().toISOString()
    let 参数副本 = 复制JSON(参数)
    if (工具.trim() === '') throw new Error('操作记录缺少工具名')
    return await this.排队(async (): Promise<number> => {
      let 文档 = this.获得文档()
      let id = this.分配编号(文档)
      let 条目: 操作调用条目 = {
        id,
        kind: 'call',
        tool: 工具,
        arguments: 参数副本,
        start,
        status: 'pending',
        notes: null,
      }
      await this.提交({ ...文档, nextId: id + 1, entries: [...文档.entries, 条目] })
      return id
    })
  }

  public async 完成(id: number, 结果: 操作调用结果): Promise<void> {
    检查索引(id, '操作 ID', 1)
    let end = new Date().toISOString()
    let 证据 = { artifacts: 结果.artifacts.map((文件) => ({ ...文件 })), evidenceErrors: [...结果.evidenceErrors] }
    let 完成内容: 完成字段
    switch (结果.status) {
      case 'passed':
        完成内容 = { ...证据, end, status: 'passed', result: 复制JSON(结果.result) }
        break
      case 'failed':
        完成内容 = { ...证据, end, status: 'failed', error: 结果.error }
        break
    }
    await this.排队(async (): Promise<void> => {
      let 文档 = this.获得文档()
      let 当前 = 文档.entries.find((条目) => 条目.id === id)
      if (当前 === undefined) return
      if (当前.kind !== 'call' || 当前.status !== 'pending') throw new Error(`操作 ${String(id)} 不在运行中`)
      let entries = 文档.entries.map((条目) => (条目 === 当前 ? { ...当前, ...完成内容 } : 条目))
      await this.提交({ ...文档, entries })
    })
  }

  public 列出(偏移: number, 数量: number): Promise<{ total: number; entries: 操作记录摘要[] }> {
    return this.排队(() => {
      检查索引(偏移, '偏移量', 0)
      检查索引(数量, '条目数', 1)
      let { entries } = this.获得文档()
      return { total: entries.length, entries: entries.slice(偏移, 偏移 + 数量).map(生成摘要) }
    })
  }

  public 获得(id: number): Promise<操作记录条目> {
    return this.排队(() => structuredClone(this.查找条目(this.获得文档(), id)))
  }

  public 更新说明(id: number, 说明: string | null | undefined, 决策说明?: string | null): Promise<void> {
    return this.排队(async (): Promise<void> => {
      let 文档 = this.获得文档()
      let 当前 = this.查找条目(文档, id)
      let notes = 说明 === undefined ? 当前.notes : 说明
      let decision = 决策说明 === undefined ? 当前.decision : 决策说明
      if (当前.notes === notes && 当前.decision === decision) return
      let entries = 文档.entries.map((条目) =>
        条目 === 当前 ? { ...当前, notes, ...(decision === undefined ? {} : { decision }) } : 条目,
      )
      await this.提交({ ...文档, entries })
    })
  }

  public 删除(编号们: readonly number[]): Promise<void> {
    let 编号集合 = new Set(编号们)
    return this.排队(async (): Promise<void> => {
      let 文档 = this.获得文档()
      if (编号集合.size === 0) return
      for (let id of 编号集合) this.查找条目(文档, id)
      let entries = 文档.entries.filter((条目) => 编号集合.has(条目.id) === false)
      await this.提交({ ...文档, entries })
    })
  }

  public 移动(id: number, 放在此编号前: number | null): Promise<void> {
    return this.排队(async (): Promise<void> => {
      let 文档 = this.获得文档()
      let 要移动 = this.查找条目(文档, id)
      if (放在此编号前 === id) return
      let 后项 = 放在此编号前 === null ? undefined : this.查找条目(文档, 放在此编号前)
      let entries = 文档.entries.filter((条目) => 条目 !== 要移动)
      entries.splice(后项 === undefined ? entries.length : entries.indexOf(后项), 0, 要移动)
      await this.提交({ ...文档, entries })
    })
  }

  public 清空(): Promise<void> {
    return this.排队(async (): Promise<void> => {
      let 文档 = this.获得文档()
      if (文档.entries.length === 0) return
      await this.提交({ ...文档, entries: [] })
    })
  }

  public async 添加断言(
    来源ID: number,
    结果路径: readonly (string | number)[],
    期望: JSON值,
    说明?: string,
  ): Promise<number> {
    let createdAt = new Date().toISOString()
    let 期望副本 = 复制JSON(期望)
    let 路径副本 = 结果路径模式.parse(结果路径)
    return await this.排队(async (): Promise<number> => {
      let 文档 = this.获得文档()
      let 来源 = this.查找条目(文档, 来源ID)
      if (来源.kind !== 'call' || 来源.status !== 'passed') throw new Error('断言必须引用已成功的工具调用')
      let id = this.分配编号(文档)
      let 条目: 操作断言条目 = {
        id,
        kind: 'assertion',
        sourceId: 来源ID,
        path: 路径副本,
        operator: 'deepEqual',
        expected: 期望副本,
        notes: 说明 ?? null,
        createdAt,
      }
      let entries = [...文档.entries]
      let 插入索引 = entries.indexOf(来源) + 1
      for (
        let 后项 = entries[插入索引];
        后项?.kind === 'assertion' && 后项.sourceId === 来源ID;
        后项 = entries[插入索引]
      )
        插入索引 += 1
      entries.splice(插入索引, 0, 条目)
      await this.提交({ ...文档, nextId: id + 1, entries })
      return id
    })
  }

  private 排队<T>(操作: () => T | Promise<T>): Promise<T> {
    let 本次 = this.队列.then(操作)
    // 错误由本次调用者处理，之后的操作仍从上次提交的文档开始。
    this.队列 = 本次.then(
      (): void => {},
      (): void => {},
    )
    return 本次
  }

  private 获得文档(): 操作记录文档 {
    if (this.文档 === undefined) throw new Error('操作记录尚未初始化')
    return this.文档
  }

  private 查找条目(文档: 操作记录文档, id: number): 操作记录条目 {
    检查索引(id, '操作 ID', 1)
    let 条目 = 文档.entries.find((候选) => 候选.id === id)
    if (条目 === undefined) throw new Error(`找不到操作记录 ${String(id)}`)
    return 条目
  }

  private 分配编号(文档: 操作记录文档): number {
    if (Number.isSafeInteger(文档.nextId + 1) === false) throw new Error('操作记录 ID 已用尽')
    return 文档.nextId
  }

  private async 提交(文档: 操作记录文档): Promise<void> {
    let 内容 = `${JSON.stringify(文档, null, 2)}\n`
    let 临时路径 = `${this.文件路径}.${randomUUID()}.tmp`
    let 文件 = await open(临时路径, 'wx', 0o600)
    try {
      try {
        await 文件.writeFile(内容, 'utf8')
        await 文件.sync()
      } finally {
        await 文件.close()
      }
      await rename(临时路径, this.文件路径)
    } catch (错误) {
      try {
        await rm(临时路径, { force: true })
      } catch (清理错误) {
        throw new AggregateError([错误, 清理错误], '保存操作记录失败，临时文件也未能清理')
      }
      throw 错误
    }
    this.文档 = 文档
  }
}
