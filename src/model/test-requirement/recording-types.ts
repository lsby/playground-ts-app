import type { JSON值 } from '../data/json-value'
import type { 测试建议 } from './model'
import type { 记录状态 } from './recording-support'

export type JSON对象 = { [键: string]: JSON值 }

export type 证据文件 = { path: string; description?: string }
/** 失败发生在动作之前（一定没有副作用）还是之后（动作可能已经生效）。 */
export type 失败阶段 = 'before-action' | 'after-action'
export type 调用结论 =
  | { status: 'passed'; result: JSON对象 }
  | { status: 'failed'; error: string; failurePhase?: 失败阶段 }
export type 操作调用结果 = 调用结论 & {
  artifacts: readonly 证据文件[]
  evidenceErrors: readonly string[]
  增强?: 录制增强
}

export type 记录建议 = Omit<测试建议, '改进方向'> & { 改进方向?: string }
/**
 * 录制时 MCP 自动补充的回放信息：坐标点击识别出的元素定位、动作前后的页面地址变化、没有 DOM 时的图片模板。
 * 导出时据此生成按元素点击、等地址或等图片后点击的代码。
 */
export type 录制增强 = {
  定位?: { 种类: '选择器' | '文字'; 值: string; 说明: string }
  /** 动作前后页面地址（pathname 加 hash）发生了变化。 */
  地址变化?: { 前: string; 后: string }
  /** 动作前后读取页面地址失败时的原因（动作本身仍算成功），方便排查为什么没有生成等地址。 */
  地址读取错误?: string
  模板?: {
    /** 模板图片路径；录制文件里是相对于记录目录的路径，导出时已换成绝对路径。 */
    文件: string
    /** 截图像素与操作坐标单位之比。 */
    比例: number
    原坐标: { x: number; y: number }
    落点: { x: number; y: number }
  }
}
export type 基本条目 = { id: number; notes: string | null; decision?: string | null; suggestions?: 记录建议[] }
export type 调用条目主体 = 基本条目 & {
  kind: 'call'
  tool: string
  arguments: JSON对象
  start: string
  增强?: 录制增强
  /** 测试方标记为「点错了/无效」，原因保留在记录里，效果等同排除。 */
  invalid?: { reason: string; at: string }
  /** 动作已执行但之后失败的记录，测试方确认保留。 */
  confirmed?: boolean
}
export type 完成字段 = 调用结论 & { end: string; artifacts: 证据文件[]; evidenceErrors: string[] }
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

export type 手动操作条目 = 基本条目 & { kind: 'manual'; description: string; createdAt: string }
export type 回放条目 = 操作调用条目 | 操作断言条目
export type 操作记录条目 = 回放条目 | 手动操作条目

export type 操作记录摘要 = (
  | (Pick<操作调用条目, 'id' | 'kind' | 'tool' | 'status' | 'start' | 'notes' | 'decision'> & { end?: string })
  | Omit<操作断言条目, 'expected' | 'suggestions'>
  | Omit<手动操作条目, 'suggestions'>
) & { suggestionCount?: number; inReplay?: boolean; state?: 记录状态; stateReason?: string }

export type 回放步骤选择 = { 名称?: string | undefined; 条目编号们: readonly number[] }
export type 导出回放步骤 = { 名称?: string | undefined; 条目们: 回放条目[]; 备注们: string[] }
export type 操作备注 = { id: number; operationIds: number[]; text: string }
export type 操作记录文档 = {
  version: number
  /** 已用 record_export 导出的时间；已导出的记录不会在 dev:test 重启后自动接续。 */
  exportedAt?: string
  nextId: number
  entries: 操作记录条目[]
  replaySteps: { 名称?: string; 条目编号们: number[] }[]
  notes: 操作备注[]
}
export type 断言选项 = {
  说明?: string | undefined
  并入上一组?: boolean | undefined
  期望来源?: 断言期望来源 | undefined
  /** 显式指定断言放在哪个回放条目之后；不指定则紧跟被断言的操作。 */
  放在此编号后?: number | undefined
}
export type 列出选项 = { 原始?: boolean | undefined; 在此编号后?: number | undefined }
export type 已解析回放步骤 = Omit<导出回放步骤, '备注们'>
