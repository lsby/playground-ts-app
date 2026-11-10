import { z } from 'zod'

import { JSON值模式, JSON对象模式, type JSON值 } from '../data/json-value'
import { 测试建议模型, type 测试建议 } from './model'

export type { JSON值 } from '../data/json-value'
export type JSON对象 = { [键: string]: JSON值 }

type 证据文件 = { path: string; description?: string }
type 调用结论 = { status: 'passed'; result: JSON对象 } | { status: 'failed'; error: string }
export type 操作调用结果 = 调用结论 & { artifacts: readonly 证据文件[]; evidenceErrors: readonly string[] }

type 记录建议 = Omit<测试建议, '改进方向'> & { 改进方向?: string }
type 基本条目 = { id: number; notes: string | null; decision?: string | null; suggestions?: 记录建议[] }
type 调用条目主体 = 基本条目 & { kind: 'call'; tool: string; arguments: JSON对象; start: string }
type 完成字段 = 调用结论 & { end: string; artifacts: 证据文件[]; evidenceErrors: string[] }
export type 操作调用条目 = 调用条目主体 & ({ status: 'pending' } | 完成字段)
export type 断言期望来源 = { sourceId: number; path: Array<string | number> }
export type 操作断言条目 = 基本条目 & {
  kind: 'assertion'
  sourceId: number
  path: Array<string | number>
  operator: 'deepEqual'
  mergeWithPreviousAttachmentGroup?: boolean
  createdAt: string
} & ({ expected: JSON值; expectedFrom?: never } | { expected?: never; expectedFrom: 断言期望来源 })

type 手动操作条目 = 基本条目 & { kind: 'manual'; description: string; createdAt: string }
export type 回放条目 = 操作调用条目 | 操作断言条目
export type 操作记录条目 = 回放条目 | 手动操作条目
export type 操作记录摘要 = (
  | (Pick<操作调用条目, 'id' | 'kind' | 'tool' | 'status' | 'start' | 'notes' | 'decision'> & { end?: string })
  | Omit<操作断言条目, 'expected' | 'suggestions'>
  | Omit<手动操作条目, 'suggestions'>
) & { suggestionCount?: number; inReplay?: boolean }

export type 回放步骤选择 = { 名称?: string | undefined; 条目编号们: readonly number[] }
export type 导出回放步骤 = { 名称?: string | undefined; 条目们: 回放条目[]; 备注们: string[] }
type 操作备注 = { id: number; operationIds: number[]; text: string }
type 操作记录文档 = {
  version: number
  nextId: number
  entries: 操作记录条目[]
  replaySteps: { 名称?: string; 条目编号们: number[] }[]
  notes: 操作备注[]
}
type 断言选项 = { 说明?: string | undefined; 并入上一组?: boolean | undefined; 期望来源?: 断言期望来源 | undefined }
type 列出选项 = { 原始?: boolean | undefined; 在此编号后?: number | undefined }
type 已解析回放步骤 = Omit<导出回放步骤, '备注们'>

let 结果路径模式 = z.array(z.union([z.string(), z.number().int().nonnegative().safe()]))

function 检查索引(值: number, 名称: string, 最小值: number): void {
  if (Number.isSafeInteger(值) === false || 值 < 最小值)
    throw new Error(`${名称}必须是大于或等于 ${String(最小值)} 的安全整数`)
}

function 非空文本(值: string, 名称: string): string {
  let 内容 = 值.trim()
  if (内容 === '') throw new Error(`${名称}不能为空`)
  return 内容
}

export function 读取操作结果字段(
  结果们: ReadonlyMap<number, JSON对象>,
  来源ID: number,
  路径: readonly (string | number)[],
): JSON值 {
  let 值: JSON值 | undefined = 结果们.get(来源ID)
  if (值 === undefined) throw new Error(`未获得操作 #${String(来源ID)} 的运行结果`)
  for (let 片段 of 路径) {
    if (typeof 片段 === 'number' && Array.isArray(值) && Object.hasOwn(值, 片段)) {
      值 = 值[片段]
    } else if (
      typeof 片段 === 'string' &&
      值 !== null &&
      typeof 值 === 'object' &&
      Array.isArray(值) === false &&
      Object.hasOwn(值, 片段)
    ) {
      值 = 值[片段]
    } else {
      值 = undefined
    }
    if (值 === undefined) throw new Error(`操作 #${String(来源ID)} 的运行结果缺少路径 ${JSON.stringify(路径)}`)
  }
  return 值
}

/**
 * 测试录制保存一次探索中的现场操作和据此整理的回放草稿。
 * 它记录工具调用和人工补录，维护与操作关联的备注，以及回放步骤间的断言依赖。
 * 探索者可以查阅现场记录、编辑回放顺序与分组，并取出经过检查的导出步骤。
 */
export class 测试录制 {
  private 下一个编号 = 1
  private 条目们: ReadonlyMap<number, 操作记录条目> = new Map()
  private 回放步骤: readonly 回放步骤选择[] = []
  private 备注们: readonly 操作备注[] = []

  public 复制(): 测试录制 {
    let 副本 = new 测试录制()
    副本.下一个编号 = this.下一个编号
    副本.条目们 = this.条目们
    副本.回放步骤 = this.回放步骤
    副本.备注们 = this.备注们
    return 副本
  }

  public 快照(): 操作记录文档 {
    return {
      version: 3,
      nextId: this.下一个编号,
      entries: structuredClone([...this.条目们.values()]),
      replaySteps: this.获得回放草稿(),
      notes: this.获得备注们(),
    }
  }

  public 开始(工具: string, 参数: JSON对象, start: string): number {
    非空文本(工具, '工具名')
    let id = this.可用编号()
    let 条目: 操作调用条目 = {
      id,
      kind: 'call',
      tool: 工具,
      arguments: this.复制对象(参数),
      start,
      status: 'pending',
      notes: null,
    }
    this.条目们 = new Map(this.条目们).set(id, 条目)
    this.回放步骤 = [...this.回放步骤, { 条目编号们: [id] }]
    this.下一个编号 = id + 1
    return id
  }

  public 完成(id: number, 结果: 操作调用结果, end: string): void {
    let 当前 = this.查找条目(id)
    if (当前.kind !== 'call' || 当前.status !== 'pending') throw new Error(`操作 #${String(id)} 不在运行中`)
    let 证据 = { artifacts: 结果.artifacts.map((文件) => ({ ...文件 })), evidenceErrors: [...结果.evidenceErrors] }
    let 完成内容: 完成字段
    switch (结果.status) {
      case 'passed':
        完成内容 = { ...证据, end, status: 'passed', result: this.复制对象(结果.result) }
        break
      case 'failed':
        完成内容 = { ...证据, end, status: 'failed', error: 结果.error }
        break
    }
    this.条目们 = new Map(this.条目们).set(id, { ...当前, ...完成内容 })
  }

  public 列出(偏移: number, 数量: number, 选项?: 列出选项): { total: number; entries: 操作记录摘要[] } {
    检查索引(偏移, '偏移量', 0)
    检查索引(数量, '条目数', 1)
    let 起始编号 = 选项?.在此编号后 ?? 0
    检查索引(起始编号, '起始操作 ID', 0)
    let 回放编号们 = this.回放步骤.flatMap((步骤) => 步骤.条目编号们)
    let 原始视图 = 选项?.原始 === true
    let 回放编号集合 = 原始视图 ? new Set(回放编号们) : undefined
    let 编号们 = 原始视图 ? [...this.条目们.keys()] : 回放编号们
    let 匹配编号们 = 编号们.filter((id) => id > 起始编号)
    return {
      total: 匹配编号们.length,
      entries: 匹配编号们
        .slice(偏移, 偏移 + 数量)
        .map((id) => ({
          ...this.生成摘要(this.查找条目(id)),
          ...(回放编号集合 === undefined ? {} : { inReplay: 回放编号集合.has(id) }),
        })),
    }
  }

  public 获得(id: number): 操作记录条目 {
    return structuredClone(this.查找条目(id))
  }

  public 更新说明(id: number, 说明: string | null | undefined, 决策说明?: string | null): void {
    let 当前 = this.查找条目(id)
    let notes = 说明 === undefined ? 当前.notes : 说明
    let decision = 决策说明 === undefined ? 当前.decision : 决策说明
    if (当前.notes === notes && 当前.decision === decision) return
    this.条目们 = new Map(this.条目们).set(id, { ...当前, notes, ...(decision === undefined ? {} : { decision }) })
  }

  public 添加建议(id: number, 建议: 测试建议): void {
    let 当前 = this.查找条目(id)
    if (当前.kind === 'call' && 当前.status === 'pending') throw new Error(`操作 #${String(id)} 尚未完成`)
    let { 改进方向, ...正文 } = 测试建议模型.parse(建议)
    let 内容: 记录建议 = 改进方向 === undefined ? 正文 : { ...正文, 改进方向 }
    let suggestions = [...(当前.suggestions ?? []), 内容]
    this.条目们 = new Map(this.条目们).set(id, { ...当前, suggestions })
  }

  public 补录(说明: string, 时间: string): number {
    let description = 非空文本(说明, '补录说明')
    let id = this.可用编号()
    this.条目们 = new Map(this.条目们).set(id, { id, kind: 'manual', description, createdAt: 时间, notes: null })
    this.下一个编号 = id + 1
    return id
  }

  public 添加备注(ids: readonly number[], 文本: string): number {
    this.检查批次编号(ids)
    let text = 非空文本(文本, '备注')
    for (let id of ids) this.查找条目(id)
    let id = this.可用编号()
    this.备注们 = [...this.备注们, { id, operationIds: [...ids], text }]
    this.下一个编号 = id + 1
    return id
  }

  public 获得备注们(): 操作备注[] {
    return structuredClone([...this.备注们])
  }

  public 更新备注(id: number, 文本: string | null): void {
    检查索引(id, '备注 ID', 1)
    let 当前 = this.备注们.find((备注) => 备注.id === id)
    if (当前 === undefined) throw new Error(`找不到备注 #${String(id)}`)
    if (文本 === null) {
      this.备注们 = this.备注们.filter((备注) => 备注 !== 当前)
      return
    }
    let text = 非空文本(文本, '备注')
    this.备注们 = this.备注们.map((备注) => (备注 === 当前 ? { ...备注, text } : 备注))
  }

  public 排除(ids: readonly number[]): void {
    this.检查批次编号(ids)
    for (let id of ids) this.定位回放步骤(id)
    let 排除编号们 = new Set(ids)
    let 候选步骤 = this.回放步骤
      .map((步骤) => ({ ...步骤, 条目编号们: 步骤.条目编号们.filter((id) => 排除编号们.has(id) === false) }))
      .filter((步骤) => 步骤.条目编号们.length > 0)
    this.提交回放(候选步骤)
  }

  public 恢复(ids: readonly number[]): void {
    this.检查批次编号(ids)
    let 已选编号们 = new Set(this.回放步骤.flatMap((步骤) => 步骤.条目编号们))
    for (let id of ids) {
      let 条目 = this.查找条目(id)
      if (条目.kind === 'manual') throw new Error(`手动补录 #${String(id)} 不能回放`)
      if (已选编号们.has(id)) throw new Error(`操作 #${String(id)} 已纳入回放`)
    }
    this.提交回放([...this.回放步骤, ...ids.map((id) => ({ 条目编号们: [id] }))])
  }

  public 移动(id: number, beforeId: number | null): void {
    let 原位置 = this.定位回放步骤(id)
    let 目标位置 = beforeId === null ? this.回放步骤.length : this.定位回放步骤(beforeId)
    if (原位置 === 目标位置) return
    let 候选步骤 = [...this.回放步骤]
    let [移动步骤] = 候选步骤.splice(原位置, 1)
    if (移动步骤 === undefined) throw new Error(`找不到操作 #${String(id)} 所在的回放步骤`)
    候选步骤.splice(原位置 < 目标位置 ? 目标位置 - 1 : 目标位置, 0, 移动步骤)
    this.提交回放(候选步骤)
  }

  public 清空(): void {
    let 进行中 = [...this.条目们.values()].find((条目) => 条目.kind === 'call' && 条目.status === 'pending')
    if (进行中 !== undefined) throw new Error(`操作 #${String(进行中.id)} 尚未完成，不能清空记录`)
    this.条目们 = new Map()
    this.回放步骤 = []
    this.备注们 = []
  }

  public 添加断言(
    来源ID: number,
    结果路径: readonly (string | number)[],
    期望: JSON值 | undefined,
    选项: 断言选项,
    createdAt: string,
  ): number {
    if ((期望 === undefined) === (选项.期望来源 === undefined)) throw new Error('必须且只能指定一个断言期望')
    let id = this.可用编号()
    let path = 结果路径模式.parse(结果路径)
    let 期望来源 = 选项.期望来源
    let 条目: 操作断言条目 = {
      id,
      kind: 'assertion',
      sourceId: 来源ID,
      path,
      operator: 'deepEqual',
      ...(期望来源 === undefined
        ? { expected: this.复制JSON(期望) }
        : { expectedFrom: { sourceId: 期望来源.sourceId, path: 结果路径模式.parse(期望来源.path) } }),
      notes: 选项.说明 ?? null,
      ...(选项.并入上一组 === undefined ? {} : { mergeWithPreviousAttachmentGroup: 选项.并入上一组 }),
      createdAt,
    }
    let 来源位置 = this.定位回放步骤(来源ID)
    let 期望位置 = 期望来源 === undefined ? -1 : this.定位回放步骤(期望来源.sourceId)
    let 插入位置 = Math.max(来源位置, 期望位置) + 1
    while (this.是同源单项断言步骤(this.回放步骤[插入位置], 来源ID)) 插入位置 += 1
    let 候选步骤 = [...this.回放步骤]
    候选步骤.splice(插入位置, 0, { 条目编号们: [id] })
    let 候选条目们 = new Map(this.条目们).set(id, 条目)
    this.验证结果引用(条目, 候选条目们, `断言 #${String(id)}`)
    this.提交回放(候选步骤, 候选条目们)
    this.下一个编号 = id + 1
    return id
  }

  public 分组(名称: string, ids: readonly number[]): void {
    let 标题 = 非空文本(名称, '步骤名称')
    this.检查批次编号(ids)
    let 选择编号们 = new Set(ids)
    let 起点 = this.回放步骤.length
    let 终点 = 0
    for (let id of ids) {
      let 位置 = this.定位回放步骤(id)
      起点 = Math.min(起点, 位置)
      终点 = Math.max(终点, 位置 + 1)
    }
    let 区间编号们: number[] = []
    for (let 步骤 of this.回放步骤.slice(起点, 终点)) {
      let 选中数 = 步骤.条目编号们.filter((id) => 选择编号们.has(id)).length
      if (选中数 === 0) throw new Error('分组只能选择连续的回放操作')
      if (选中数 !== 步骤.条目编号们.length) {
        throw new Error(`分组只选中了步骤「${步骤.名称 ?? 步骤.条目编号们.join('、')}」的一部分，请先拆组`)
      }
      for (let id of 步骤.条目编号们) 区间编号们.push(id)
    }
    if (区间编号们.some((id, 索引) => id !== ids[索引])) throw new Error('分组编号必须按当前回放顺序排列')
    let 候选步骤 = [...this.回放步骤]
    候选步骤.splice(起点, 终点 - 起点, { 名称: 标题, 条目编号们: 区间编号们 })
    this.提交回放(候选步骤)
  }

  public 拆组(id: number): void {
    let 位置 = this.定位回放步骤(id)
    let 步骤 = this.回放步骤[位置]
    if (步骤 === undefined) throw new Error(`找不到操作 #${String(id)} 所在的回放步骤`)
    let 候选步骤 = [
      ...this.回放步骤.slice(0, 位置),
      ...步骤.条目编号们.map((编号) => ({ 条目编号们: [编号] })),
      ...this.回放步骤.slice(位置 + 1),
    ]
    this.提交回放(候选步骤)
  }

  public 获得回放草稿(): 操作记录文档['replaySteps'] {
    return this.回放步骤.map(({ 名称, 条目编号们 }) => ({
      ...(名称 === undefined ? {} : { 名称 }),
      条目编号们: [...条目编号们],
    }))
  }

  public 准备导出(步骤组: readonly 回放步骤选择[] = this.回放步骤): 导出回放步骤[] {
    if (步骤组.length === 0) throw new Error('没有选中可导出的操作记录')
    let 已纳入编号们 = new Set(this.回放步骤.flatMap((步骤) => 步骤.条目编号们))
    let 解析步骤 = this.解析回放(步骤组, this.条目们)
    return 解析步骤.map(({ 名称, 条目们 }, 索引) => {
      let 步骤说明 = this.步骤说明(名称, 索引)
      for (let 条目 of 条目们) {
        let 操作说明 = `${步骤说明}的操作 #${String(条目.id)}`
        if (已纳入编号们.has(条目.id) === false) throw new Error(`${操作说明}未纳入回放草稿，请先恢复`)
        if (条目.kind !== 'call') continue
        if (条目.status === 'pending') throw new Error(`${操作说明}（${条目.tool}）尚未完成`)
        if (条目.status === 'failed') throw new Error(`${操作说明}（${条目.tool}）执行失败：${条目.error}`)
      }
      let 当前编号们 = new Set(条目们.map((条目) => 条目.id))
      let 备注们 = this.备注们
        .filter(({ operationIds }) => operationIds.every((编号) => 当前编号们.has(编号)))
        .map(({ text }) => text)
      return { ...(名称 === undefined ? {} : { 名称 }), 条目们: structuredClone(条目们), 备注们 }
    })
  }

  private 复制对象(值: JSON对象): JSON对象 {
    let 副本 = structuredClone(值)
    JSON对象模式.parse(副本)
    return 副本
  }

  private 复制JSON(值: JSON值 | undefined): JSON值 {
    if (值 === undefined) throw new Error('断言缺少期望')
    let 副本 = structuredClone(值)
    JSON值模式.parse(副本)
    return 副本
  }

  private 生成摘要(条目: 操作记录条目): 操作记录摘要 {
    let 建议摘要 = 条目.suggestions === undefined ? {} : { suggestionCount: 条目.suggestions.length }
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
          ...建议摘要,
          ...(条目.status === 'pending' ? {} : { end: 条目.end }),
        }
      }
      case 'manual': {
        let { suggestions: _建议, ...摘要 } = 条目
        return { ...摘要, ...建议摘要 }
      }
      case 'assertion': {
        let { expected: _期望, suggestions: _建议, ...摘要 } = 条目
        return { ...structuredClone(摘要), ...建议摘要 }
      }
    }
  }

  private 查找条目(id: number): 操作记录条目 {
    检查索引(id, '操作 ID', 1)
    let 条目 = this.条目们.get(id)
    if (条目 === undefined) throw new Error(`找不到操作记录 #${String(id)}`)
    return 条目
  }

  private 可用编号(): number {
    if (Number.isSafeInteger(this.下一个编号 + 1) === false) throw new Error('操作记录 ID 已用尽')
    return this.下一个编号
  }

  private 检查批次编号(ids: readonly number[]): void {
    if (ids.length === 0) throw new Error('请提供至少一个操作 ID')
    let 已见编号们 = new Set<number>()
    for (let id of ids) {
      检查索引(id, '操作 ID', 1)
      if (已见编号们.has(id)) throw new Error(`重复选择了操作 #${String(id)}`)
      已见编号们.add(id)
    }
  }

  private 定位回放步骤(id: number): number {
    let 条目 = this.查找条目(id)
    if (条目.kind === 'manual') throw new Error(`手动补录 #${String(id)} 不能回放`)
    let 索引 = this.回放步骤.findIndex((步骤) => 步骤.条目编号们.includes(id))
    if (索引 < 0) throw new Error(`操作 #${String(id)} 未纳入回放草稿，请先恢复`)
    return 索引
  }

  private 是同源单项断言步骤(步骤: 回放步骤选择 | undefined, 来源ID: number): boolean {
    if (步骤 === undefined || 步骤.名称 !== undefined || 步骤.条目编号们.length !== 1) return false
    let [编号] = 步骤.条目编号们
    if (编号 === undefined) return false
    let 条目 = this.查找条目(编号)
    return 条目.kind === 'assertion' && 条目.sourceId === 来源ID
  }

  private 步骤说明(名称: string | undefined, 索引: number): string {
    return 名称 === undefined ? `步骤 ${String(索引 + 1)}` : `步骤「${名称}」`
  }

  private 解析回放(步骤组: readonly 回放步骤选择[], 条目们: ReadonlyMap<number, 操作记录条目>): 已解析回放步骤[] {
    let 已选条目们 = new Map<number, 回放条目>()
    return 步骤组.map(({ 名称, 条目编号们 }, 索引) => {
      let 步骤说明 = this.步骤说明(名称, 索引)
      if (条目编号们.length === 0) throw new Error(`${步骤说明}至少需要一个操作`)
      let 标题 = 名称 === undefined ? undefined : 非空文本(名称, `${步骤说明}名称`)
      let 步骤条目们 = 条目编号们.map((id) => {
        检查索引(id, `${步骤说明}的操作 ID`, 1)
        if (已选条目们.has(id)) throw new Error(`${步骤说明}重复选择了操作 #${String(id)}`)
        let 条目 = 条目们.get(id)
        if (条目 === undefined) throw new Error(`${步骤说明}找不到操作 #${String(id)}`)
        if (条目.kind === 'manual') throw new Error(`${步骤说明}的手动补录 #${String(id)} 不能回放`)
        if (条目.kind === 'assertion') this.验证结果引用(条目, 已选条目们, `${步骤说明}的断言 #${String(id)}`)
        已选条目们.set(id, 条目)
        return 条目
      })
      return { ...(标题 === undefined ? {} : { 名称: 标题 }), 条目们: 步骤条目们 }
    })
  }

  private 验证结果引用(断言: 操作断言条目, 可用条目们: ReadonlyMap<number, 操作记录条目>, 断言说明: string): void {
    let 引用们 = [
      { sourceId: 断言.sourceId, path: 断言.path },
      ...(断言.expectedFrom === undefined ? [] : [断言.expectedFrom]),
    ]
    for (let { sourceId, path } of 引用们) {
      let 来源 = 可用条目们.get(sourceId)
      let 来源说明 = `${断言说明}的来源操作 #${String(sourceId)}`
      if (来源 === undefined) throw new Error(`${来源说明}必须纳入回放并排在断言之前`)
      if (来源.kind !== 'call' || 来源.status !== 'passed') throw new Error(`${来源说明}必须是成功完成的工具调用`)
      try {
        读取操作结果字段(new Map([[sourceId, 来源.result]]), sourceId, path)
      } catch (错误) {
        throw new Error(`${来源说明}缺少结果路径 ${JSON.stringify(path)}`, { cause: 错误 })
      }
    }
  }

  private 提交回放(步骤组: readonly 回放步骤选择[], 条目们 = this.条目们): void {
    this.解析回放(步骤组, 条目们)
    this.条目们 = 条目们
    this.回放步骤 = 步骤组
  }
}
