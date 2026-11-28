import { z } from 'zod'

import { JSON值模式, JSON对象模式, type JSON值 } from '../data/json-value'
import { 测试建议模型, type 测试建议 } from './model'
import { 核对断言期望 } from './recording-assertion-check'
import { 读取操作结果字段 } from './recording-result'
import {
  列出待确认,
  导出阻止原因,
  应用无效标记,
  应用确认保留,
  操作记录文档模型,
  生成待确认错误,
  计算插入断言后的步骤,
  计算记录状态,
  读回条目们,
  逐条排除条目,
  附带遗漏的断言,
  type 逐条排除结果,
} from './recording-support'
import type {
  JSON对象,
  列出选项,
  回放条目,
  回放步骤选择,
  完成字段,
  导出回放步骤,
  已解析回放步骤,
  操作备注,
  操作断言条目,
  操作记录摘要,
  操作记录文档,
  操作记录条目,
  操作调用条目,
  操作调用结果,
  断言选项,
  记录建议,
} from './recording-types'

export type { JSON值 } from '../data/json-value'
export type { 记录状态 } from './recording-support'
export type * from './recording-types'
export { 计算记录状态 }

export { 读取操作结果字段 }

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

/**
 * 测试录制保存一次探索中的现场操作和据此整理的回放草稿。
 * 它记录工具调用和人工补录，维护与操作关联的备注，以及回放步骤间的断言依赖。
 * 探索者可以查阅现场记录、编辑回放顺序与分组，并取出经过检查的导出步骤。
 */
export class 测试录制 {
  /** 从落盘的记录文件读回录制；上次还在运行的调用记为动作后失败，等测试方确认。 */
  public static 从快照(文档: unknown, 恢复时间: string): 测试录制 {
    let 版本 = z.object({ version: z.literal(4) }).safeParse(文档)
    if (版本.success === false) throw new Error('录制格式必须是 version 4；旧格式请重新录制或使用 --fresh-record')
    let 结构 = 操作记录文档模型.parse(文档)
    let 录制 = new 测试录制()
    录制.下一个编号 = 结构.nextId
    // 完整 Schema 已校验全部条目；Zod 的可选属性类型包含 undefined，JSON 文件中该值无法存在。
    录制.条目们 = 读回条目们(结构.entries as 操作记录条目[], 恢复时间)
    录制.回放步骤 = 结构.replaySteps.map(({ 名称, 条目编号们 }) => ({
      ...(名称 === undefined ? {} : { 名称 }),
      条目编号们,
    }))
    录制.备注们 = 结构.notes
    录制.导出时间 = 结构.exportedAt
    return 录制
  }

  private 下一个编号 = 1
  private 条目们: ReadonlyMap<number, 操作记录条目> = new Map()
  private 回放步骤: readonly 回放步骤选择[] = []
  private 备注们: readonly 操作备注[] = []
  private 导出时间: string | undefined

  public 复制(): 测试录制 {
    let 副本 = new 测试录制()
    副本.下一个编号 = this.下一个编号
    副本.条目们 = this.条目们
    副本.回放步骤 = this.回放步骤
    副本.备注们 = this.备注们
    副本.导出时间 = this.导出时间
    return 副本
  }

  public 标记已导出(时间: string): void {
    this.导出时间 = 时间
  }

  public 快照(): 操作记录文档 {
    return {
      version: 4,
      ...(this.导出时间 === undefined ? {} : { exportedAt: this.导出时间 }),
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
    // 导出之后又有新操作，这份记录就有了没导出的内容，重启后应该接续。
    this.导出时间 = undefined
    return id
  }

  public 完成(id: number, 结果: 操作调用结果, end: string): void {
    let 当前 = this.查找条目(id)
    if (当前.kind !== 'call' || 当前.status !== 'pending') throw new Error(`操作 #${String(id)} 不在运行中`)
    let 证据 = {
      artifacts: 结果.artifacts.map((文件) => ({ ...文件 })),
      evidenceErrors: [...结果.evidenceErrors],
      ...(结果.增强 === undefined ? {} : { 增强: structuredClone(结果.增强) }),
    }
    let 完成内容: 完成字段
    switch (结果.status) {
      case 'passed':
        完成内容 = { ...证据, end, status: 'passed', result: this.复制对象(结果.result) }
        break
      case 'failed':
        完成内容 = {
          ...证据,
          end,
          status: 'failed',
          error: 结果.error,
          ...(结果.failurePhase === undefined ? {} : { failurePhase: 结果.failurePhase }),
        }
        break
    }
    let 完成后: 操作调用条目 = { ...当前, ...完成内容 }
    this.条目们 = new Map(this.条目们).set(id, 完成后)
    // 动作执行前就失败的调用一定没有副作用，自动移出回放草稿（原始记录和证据仍保留，可用 record_list 的 recording 视图查看）。
    if (计算记录状态(完成后).state === '已排除') this.回放步骤 = this.去掉步骤条目(new Set([id]))
  }

  /** 测试方把记录标为「点错了/无效」并写原因，效果等同排除，原因保留在记录里。reason 为 null 取消标记（不自动回到回放草稿）。 */
  /** 测试方把记录标为「点错了/无效」并写原因，效果等同排除，原因保留在记录里。reason 为 null 取消标记（不自动回到回放草稿）。 */
  public 标记无效(ids: readonly number[], 原因: string | null, 时间: string): void {
    this.检查批次编号(ids)
    let 理由 = 原因 === null ? null : 非空文本(原因, '无效原因')
    let 条目们 = 应用无效标记(this.条目们, ids, 理由, 时间)
    if (理由 === null) this.条目们 = 条目们
    else this.提交回放(this.去掉步骤条目(new Set(ids)), 条目们)
  }

  /** 测试方确认：动作后失败的记录保留（按已执行处理）。 */
  public 确认保留(ids: readonly number[]): void {
    this.检查批次编号(ids)
    this.条目们 = 应用确认保留(this.条目们, ids)
  }

  /** 列出尚未处理的待确认记录：还在回放草稿里的才算，已用 record_remove 删掉的视为已处理。 */
  public 获得待确认(范围编号们?: ReadonlySet<number>): 操作调用条目[] {
    return 列出待确认(this.条目们, new Set(this.回放步骤.flatMap((步骤) => 步骤.条目编号们)), 范围编号们)
  }

  private 去掉步骤条目(编号们: ReadonlySet<number>): 回放步骤选择[] {
    return this.回放步骤
      .map((步骤) => ({ ...步骤, 条目编号们: 步骤.条目编号们.filter((id) => 编号们.has(id) === false) }))
      .filter((步骤) => 步骤.条目编号们.length > 0)
  }

  public 列出(
    偏移: number,
    数量: number,
    选项?: 列出选项,
  ): { total: number; entries: 操作记录摘要[]; needsConfirmIds: number[] } {
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
      needsConfirmIds: this.获得待确认().map(({ id }) => id),
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

  /** 批量排除，逐条处理，一条删不掉不影响别的，规则见 逐条排除条目。 */
  public 逐条排除(ids: readonly number[]): 逐条排除结果 {
    return 逐条排除条目(ids, {
      查找: (id) => void this.查找条目(id),
      在回放: (id) => this.回放步骤.some((步骤) => 步骤.条目编号们.includes(id)),
      排除: (id) => this.排除([id]),
    })
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
    this.导出时间 = undefined
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
    let 候选步骤 = 计算插入断言后的步骤(this.回放步骤, this.条目们, id, 来源ID, 期望来源?.sourceId, 选项.放在此编号后)
    let 候选条目们 = new Map(this.条目们).set(id, 条目)
    this.验证结果引用(条目, 候选条目们, `断言 #${String(id)}`)
    核对断言期望(条目, 候选条目们)
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

  public 准备导出(步骤组?: readonly 回放步骤选择[]): 导出回放步骤[] {
    let 选择组 = 步骤组 === undefined ? this.回放步骤 : 附带遗漏的断言(步骤组, this.回放步骤, this.条目们)
    if (选择组.length === 0) throw new Error('没有选中可导出的操作记录')
    let 已纳入编号们 = new Set(this.回放步骤.flatMap((步骤) => 步骤.条目编号们))
    let 解析步骤 = this.解析回放(选择组, this.条目们)
    let 选中编号们 = new Set<number>()
    let 解析结果 = 解析步骤.map(({ 名称, 条目们 }, 索引) => {
      let 步骤说明 = this.步骤说明(名称, 索引)
      for (let 条目 of 条目们) {
        选中编号们.add(条目.id)
        let 操作说明 = `${步骤说明}的操作 #${String(条目.id)}`
        if (已纳入编号们.has(条目.id) === false) throw new Error(`${操作说明}未纳入回放草稿，请先恢复`)
        if (条目.kind !== 'call') continue
        if (条目.status === 'pending') throw new Error(`${操作说明}（${条目.tool}）尚未完成`)
        let 阻止原因 = 导出阻止原因(条目)
        if (阻止原因 !== undefined) throw new Error(`${操作说明}（${条目.tool}）${阻止原因}`)
      }
      return { 名称, 条目们 }
    })
    let 待确认们 = this.获得待确认(选中编号们)
    if (待确认们.length > 0) throw 生成待确认错误(待确认们)
    return 解析结果.map(({ 名称, 条目们 }) => {
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
          ...计算记录状态(条目),
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
