import { z } from 'zod-mcp'

import type { 流程说明 } from '../../../src/model/test-requirement'
import type { 测试操作记录 } from '../../../src/test-tools/operation-record'
import { 项目根目录 } from '../../task/model/task-common'
import { 需求流程文件名格式, 需求目录路径格式 } from '../requirement/requirement-file'
import { 直接返回, type 工具注册函数 } from './register-tool'
import { 无参数模型 } from './tool-input'

export function 注册操作记录工具(
  注册: 工具注册函数,
  记录: 测试操作记录,
  获得测试地址: () => { 前端: string; 后端: string },
): void {
  let 编号模型 = z.int().positive()
  let 只读 = { readOnlyHint: true, openWorldHint: false }

  注册(
    'record_list',
    'Browser and test tool calls are recorded automatically and return recordId. After a business action or check, use view: recording and afterId to review new entries, including excluded calls and manual entries. The default view lists the replay draft in order. Use record_get for details.',
    z.strictObject({
      offset: z.int().nonnegative().default(0),
      limit: z.int().positive().default(50),
      view: z.enum(['replay', 'recording']).default('replay'),
      afterId: z.int().nonnegative().optional(),
    }),
    async ({ offset, limit, view, afterId }) =>
      直接返回(await 记录.列出(offset, limit, { 原始: view === 'recording', 在此编号后: afterId })),
    只读,
  )
  注册(
    'record_get',
    'Read a recorded call, assertion, or manual entry by its stable ID, including excluded entries and suggestions.',
    z.strictObject({ id: 编号模型 }),
    async ({ id }) => 直接返回({ entry: await 记录.获得(id) }),
    只读,
  )
  注册(
    'record_review',
    'Review the replay draft as ordered steps, with their record IDs and any notes linked to multiple operations. Use record_list for summaries and record_get for original results.',
    无参数模型,
    async () => {
      let { 步骤们, 备注们 } = await 记录.获得审阅()
      return 直接返回({
        steps: 步骤们.map(({ 名称, 条目编号们 }) => ({
          ...(名称 === undefined ? {} : { title: 名称 }),
          ids: [...条目编号们],
        })),
        notes: 备注们,
      })
    },
    只读,
  )
  注册(
    'record_add_manual',
    'Add a description of an action performed outside the test MCP tools. The entry is a manual account of what happened. If replay depends on it, provide reproducible setup in the test separately.',
    z.strictObject({ description: z.string().trim().min(1) }),
    async ({ description }) => 直接返回({ id: await 记录.补录(description) }),
  )
  注册(
    'record_note',
    'With id, update the title or decision on a single entry. With ids and a decision, add one shared note linked to several entries. With noteId and a decision, edit an existing shared note. Pass null to clear a single-entry field or remove the shared note.',
    z
      .strictObject({
        id: 编号模型.optional(),
        ids: z.array(编号模型).min(1).optional(),
        noteId: 编号模型.optional(),
        note: z.string().nullable().optional().describe('Optional title for the exported step.'),
        decision: z
          .string()
          .trim()
          .min(1)
          .nullable()
          .optional()
          .describe('Optional evidence-based explanation for the report.'),
      })
      .refine(({ id, ids, noteId, note, decision }) => {
        if ([id, ids, noteId].filter((值) => 值 !== undefined).length !== 1) return false
        if (ids !== undefined) return typeof decision === 'string' && note === undefined
        if (noteId !== undefined) return decision !== undefined && note === undefined
        return note !== undefined || decision !== undefined
      }, 'Use id with note or decision, ids with a decision string, or noteId with decision.'),
    async ({ id, ids, noteId, note, decision }) => {
      if (ids !== undefined && typeof decision === 'string')
        return 直接返回({ noteId: await 记录.添加备注(ids, decision), ids })
      if (noteId !== undefined && decision !== undefined) {
        await 记录.更新备注(noteId, decision)
        return 直接返回({ noteId })
      }
      if (id === undefined) throw new Error('缺少要更新说明的记录 ID')
      await 记录.更新说明(id, note, decision)
      return 直接返回({ id })
    },
  )
  注册(
    'record_add_suggestion',
    'Record an improvement suggestion about an operation, interaction, interface, or other aspect observed during exploration. Attach it to a completed record by ID and describe the observation and impact. Add a concrete improvement if known. The report labels suggestions separately from the acceptance result.',
    z.strictObject({
      id: 编号模型.describe('Record ID this suggestion belongs to.'),
      title: z.string().trim().min(1),
      observation: z.string().trim().min(1),
      impact: z.string().trim().min(1),
      improvement: z.string().trim().min(1).optional(),
    }),
    async ({ id, title, observation, impact, improvement }) => {
      await 记录.添加建议(id, { 标题: title, 现象: observation, 影响: impact, 改进方向: improvement })
      return 直接返回({ id })
    },
  )
  注册(
    'record_remove',
    'Exclude entries from the replay draft by ID. The original recording and evidence remain available. If an assertion still depends on an excluded call, explicitly exclude that assertion in the same edit or keep the call.',
    z.strictObject({ ids: z.array(编号模型).min(1) }),
    async ({ ids }) => {
      await 记录.排除(ids)
      return 直接返回({ ids })
    },
  )
  注册(
    'record_restore',
    'Restore excluded entries to the end of the replay draft in the supplied order. Supply any required source calls before their assertions.',
    z.strictObject({ ids: z.array(编号模型).min(1) }),
    async ({ ids }) => {
      await 记录.恢复(ids)
      return 直接返回({ ids })
    },
  )
  注册(
    'record_move',
    'Move the step containing an entry before the step containing beforeId. An ungrouped entry is its own step. Use null to move it to the end.',
    z.strictObject({ id: 编号模型, beforeId: 编号模型.nullable() }),
    async ({ id, beforeId }) => {
      await 记录.移动(id, beforeId)
      return 直接返回({ id, beforeId })
    },
  )
  注册(
    'record_group',
    'Group consecutive replay entries into one named business action or observation. Supply IDs in replay order. To take part of an existing group, ungroup it first.',
    z.strictObject({ title: z.string().trim().min(1), ids: z.array(编号模型).min(1) }),
    async ({ title, ids }) => {
      await 记录.分组(title, ids)
      return 直接返回({ title, ids })
    },
  )
  注册(
    'record_ungroup',
    'Split the step containing id back into individual replay entries. The order and the original notes are preserved.',
    z.strictObject({ id: 编号模型 }),
    async ({ id }) => {
      await 记录.拆组(id)
      return 直接返回({ id })
    },
  )
  注册(
    'record_clear',
    'Discard the full recording and replay draft. To remove a call from replay while keeping its evidence, use record_remove.',
    无参数模型,
    async () => {
      await 记录.清空()
      return 直接返回({ cleared: true })
    },
  )
  注册(
    'record_add_assertion',
    'Declare a deep-equality assertion for a successful tool result. Provide exactly one of expected (including null) or expectedFrom to compare with another successful result at replay time. Paths start at the result object; use [] for the whole result.',
    z
      .strictObject({
        sourceId: 编号模型,
        path: z.array(z.union([z.string(), z.int().nonnegative()])),
        expected: z.json().optional(),
        expectedFrom: z
          .strictObject({ sourceId: 编号模型, path: z.array(z.union([z.string(), z.int().nonnegative()])) })
          .optional(),
        note: z.string().optional(),
        mergeWithPreviousAttachmentGroup: z
          .boolean()
          .optional()
          .describe(
            'In the replay report, append the expected/actual text to the previous attachment page in the same step. Use true when the text explains the preceding evidence, such as a screenshot from a browser wait in the same exported step. By default, the assertion text gets its own page.',
          ),
      })
      .refine(
        ({ expected, expectedFrom }) => (expected === undefined) !== (expectedFrom === undefined),
        'Provide exactly one of expected or expectedFrom.',
      ),
    async ({ sourceId, path, expected, expectedFrom, note, mergeWithPreviousAttachmentGroup }) =>
      直接返回({
        id: await 记录.添加断言(sourceId, path, expected, {
          说明: note,
          并入上一组: mergeWithPreviousAttachmentGroup,
          期望来源: expectedFrom,
        }),
      }),
  )
  注册(
    'record_export',
    'Generate a requirement test from an existing requirement description and the current replay draft. Review the draft with record_review. Optionally supply explicit steps in replay order. Use concise Chinese business titles, keep acceptance checks in an observation step, and describe how the steps prove the selected acceptance criteria in scenarioApproach. A failed, unfinished, or misplaced operation is reported by ID for you to correct.',
    z
      .strictObject({
        steps: z
          .array(
            z.strictObject({
              title: z.string().trim().min(1).describe('A concise Chinese title for the business action or check.'),
              ids: z.array(编号模型).min(1).describe('Operation and assertion IDs for this step, in replay order.'),
            }),
          )
          .min(1)
          .optional()
          .describe(
            'Optional explicit selection. Omit it to use the current replay draft. Include a separate observation that checks the acceptance criteria.',
          ),
        ids: z
          .array(编号模型)
          .min(1)
          .optional()
          .describe('Legacy ungrouped export, with one step per record. Use steps for new exports.'),
        fileName: z
          .string()
          .regex(需求流程文件名格式)
          .describe('A lowercase kebab-case .ts file name for the new scenario, written beside the requirement file.'),
        requirementDirectory: z
          .string()
          .regex(需求目录路径格式)
          .describe(
            'An existing path under test/requirement, with lowercase kebab-case segments, e.g. shopping/checkout for test/requirement/shopping/checkout/index.requirement.ts.',
          ),
        acceptanceCriteriaKeys: z
          .array(z.string().min(1))
          .min(1)
          .optional()
          .describe(
            'Exact keys in the exported acceptance criteria dictionary. Required for a requirement with multiple criteria.',
          ),
        scenarioName: z.string().trim().min(1).describe('The scenario title in Chinese.'),
        scenarioApproach: z
          .string()
          .optional()
          .describe('A brief overview of what you will do, what you will check, and what counts as passing.'),
        conclusionNotes: z
          .string()
          .optional()
          .describe(
            'Coverage limits, setup choices, or other notes for the reader. The runner reports the actual result.',
          ),
      })
      .refine(({ ids, steps }) => ids === undefined || steps === undefined, 'Provide at most one of steps or ids.'),
    async ({
      ids,
      steps,
      fileName,
      requirementDirectory,
      acceptanceCriteriaKeys,
      scenarioName,
      scenarioApproach,
      conclusionNotes,
    }) => {
      let 说明 = { 测试思路: scenarioApproach, 结论补充: conclusionNotes } satisfies Required<流程说明>
      let 分组们 = steps?.map(({ title, ids }) => ({ 名称: title, 条目编号们: ids }))
      let 步骤组 = await 记录.准备导出(分组们 ?? ids?.map((id) => ({ 条目编号们: [id] })))
      let { 写出需求测试 } = await import('../requirement/export-file')
      let 路径 = await 写出需求测试(项目根目录, {
        文件名: fileName,
        需求目录名: requirementDirectory,
        覆盖验收点键们: acceptanceCriteriaKeys,
        流程名称: scenarioName,
        ...说明,
        步骤组,
        测试地址: 获得测试地址(),
      })
      return 直接返回({ path: 路径, scenarioName })
    },
  )
}
