import { z } from 'zod-mcp'

import type { 流程说明 } from '../../../src/model/test-requirement'
import { 计算记录状态 } from '../../../src/model/test-requirement/recording'
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
    'Browser and test tool calls are recorded automatically and return recordId. After a business action or check, use view: recording and afterId to review new entries, including excluded calls and manual entries. The default view lists the replay draft in order. Use record_get for details. Every call entry has state: 正常 (exported normally), 已排除 (failed before the action ran, so it had no side effect, or marked invalid with record_mark; left out of the replay draft and export), or 待确认 (the action ran but a later wait or check failed, so it may have taken effect; see needsConfirmIds and resolve each with record_confirm, record_mark or record_remove before record_export).',
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
    'Read a recorded call, assertion, or manual entry by its stable ID, including excluded entries and suggestions. A call also shows state (正常, 待确认, 已排除) and stateReason.',
    z.strictObject({ id: 编号模型 }),
    async ({ id }) => {
      let entry = await 记录.获得(id)
      return 直接返回({ entry, ...计算记录状态(entry) })
    },
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
    'Exclude entries from the replay draft by ID. The original recording and evidence remain available. Entries are handled one by one, so one entry that cannot be removed does not fail the batch. The result lists removed (taken out of the replay draft now), alreadyOut (already excluded, for example failed before the action ran or marked invalid with record_mark; nothing left to do) and skipped (id plus reason, for example an assertion that is still in the replay draft depends on the call: remove that assertion too, in the same call or first).',
    z.strictObject({ ids: z.array(编号模型).min(1) }),
    async ({ ids }) => {
      let { 已排除, 本来就不在回放, 跳过 } = await 记录.逐条排除(ids)
      return 直接返回({ ids, removed: 已排除, alreadyOut: 本来就不在回放, skipped: 跳过 })
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
    'record_mark',
    'Mark calls as clicked by mistake or invalid, with a reason. The effect is the same as record_remove (the calls leave the replay draft and export), and the reason stays in the record and shows as state 已排除. Pass reason: null to clear the mark; it does not put the call back in the replay draft (use record_restore). If an assertion still depends on a marked call, mark or remove that assertion in the same edit.',
    z.strictObject({ ids: z.array(编号模型).min(1), reason: z.string().trim().min(1).nullable() }),
    async ({ ids, reason }) => {
      await 记录.标记无效(ids, reason)
      return 直接返回({ ids, reason })
    },
  )
  注册(
    'record_confirm',
    'Keep calls whose state is 待确认 (the action ran, but a later wait or check failed). Use it only after you have confirmed on screen or in the database that the action took effect; the call is then exported as a normal action. To drop it instead, use record_mark or record_remove.',
    z.strictObject({ ids: z.array(编号模型).min(1) }),
    async ({ ids }) => {
      await 记录.确认保留(ids)
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
    'Declare a deep-equality assertion for a successful tool result. Provide exactly one of expected (including null) or expectedFrom to compare with another successful result at replay time. Paths start at the result object; use [] for the whole result. expected is the JSON value itself (write a string as a plain string, never JSON-encode it again) and must deep-equal the actual result this operation had when it was recorded; a mismatch is rejected immediately and the error shows the actual value.',
    z
      .strictObject({
        sourceId: 编号模型,
        path: z.array(z.union([z.string(), z.int().nonnegative()])),
        expected: z
          .json()
          .optional()
          .describe(
            'The JSON value itself, not a JSON-encoded string: pass a string result as the string, never wrapped in an extra layer of quotes. It must deep-equal the actual result at path recorded for this operation.',
          ),
        expectedFrom: z
          .strictObject({ sourceId: 编号模型, path: z.array(z.union([z.string(), z.int().nonnegative()])) })
          .optional(),
        note: z.string().optional(),
        afterId: 编号模型
          .optional()
          .describe(
            'Explicit position: put the assertion right after this replay entry. By default it is placed right after the call it asserts on (inside that call group when grouped), after the other assertions on the same call, so no record_move is needed.',
          ),
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
    async ({ sourceId, path, expected, expectedFrom, note, afterId, mergeWithPreviousAttachmentGroup }) =>
      直接返回({
        id: await 记录.添加断言(sourceId, path, expected, {
          说明: note,
          放在此编号后: afterId,
          并入上一组: mergeWithPreviousAttachmentGroup,
          期望来源: expectedFrom,
        }),
      }),
  )
  注册(
    'record_export',
    'Generate a requirement test from the requirement description and the current replay draft. If test/requirement/<requirementDirectory>/index.requirement.ts does not exist, a skeleton is generated from requirementName, requirementDescription and acceptanceCriteria (the result says skeletonGenerated; tell the user to review it). The export is refused while calls are still 待确认 (listed in the error): resolve each with record_confirm, record_mark or record_remove first. Assertions in the replay draft that you leave out of explicit steps are placed after the call they assert on automatically. Review the draft with record_review. Optionally supply explicit steps in replay order. Use concise Chinese business titles, keep acceptance checks in an observation step, and describe how the steps prove the selected acceptance criteria in scenarioApproach. A failed, unfinished, or misplaced operation is reported by ID for you to correct. By default an export is refused when a file with the same name but different content already exists. Pass replace: true to deliberately overwrite a previous export of the same scenario; the replacement is limited to that scenario entry file, its helper directory test/requirement-support/<requirementDirectory>/<fileName without .ts>, and the image templates this export writes under the requirement directory assets/. New content is staged first and the old files are restored if anything fails. Other scenarios and the requirement description are never touched.',
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
            'A path under test/requirement, with lowercase kebab-case segments, e.g. shopping/checkout for test/requirement/shopping/checkout/index.requirement.ts. A missing directory is created together with the skeleton.',
          ),
        requirementName: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Chinese requirement name. Required only when index.requirement.ts does not exist yet.'),
        requirementDescription: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'One-sentence Chinese requirement description. Required only when index.requirement.ts does not exist yet.',
          ),
        acceptanceCriteria: z
          .array(
            z.strictObject({
              key: z.string().trim().min(1).describe('Key in the acceptance criteria dictionary.'),
              name: z.string().trim().min(1),
              description: z.string().trim().min(1),
            }),
          )
          .min(1)
          .optional()
          .describe(
            'Acceptance criteria to write into a new skeleton. Without it, the skeleton uses acceptanceCriteriaKeys with placeholder descriptions. Ignored when index.requirement.ts already exists.',
          ),
        acceptanceCriteriaKeys: z
          .array(z.string().min(1))
          .min(1)
          .optional()
          .describe(
            'Exact keys in the exported acceptance criteria dictionary. Required for a requirement with multiple criteria.',
          ),
        replace: z
          .boolean()
          .optional()
          .describe(
            'Only true allows replacing an existing export of the same fileName: its entry file, its helper directory and the image templates this export writes. Omit for the normal refuse-if-different behavior.',
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
      requirementName,
      requirementDescription,
      acceptanceCriteria,
      scenarioName,
      scenarioApproach,
      conclusionNotes,
      replace,
    }) => {
      let 说明 = { 测试思路: scenarioApproach, 结论补充: conclusionNotes } satisfies Required<流程说明>
      let 分组们 = steps?.map(({ title, ids }) => ({ 名称: title, 条目编号们: ids }))
      let 步骤组 = await 记录.准备导出(分组们 ?? ids?.map((id) => ({ 条目编号们: [id] })))
      let { 写出需求测试 } = await import('../requirement/export-file')
      let { 路径, 已生成骨架 } = await 写出需求测试(项目根目录, {
        文件名: fileName,
        需求目录名: requirementDirectory,
        覆盖验收点键们: acceptanceCriteriaKeys,
        替换: replace,
        骨架: {
          需求名称: requirementName,
          需求描述: requirementDescription,
          验收点们: acceptanceCriteria?.map(({ key, name, description }) => ({
            键: key,
            名称: name,
            描述: description,
          })),
        },
        流程名称: scenarioName,
        ...说明,
        步骤组,
        测试地址: 获得测试地址(),
      })
      await 记录.标记已导出()
      return 直接返回({
        path: 路径,
        scenarioName,
        skeletonGenerated: 已生成骨架 !== undefined,
        ...(已生成骨架 === undefined
          ? {}
          : { skeletonPath: 已生成骨架, notice: '已生成需求骨架，请检查需求名称、描述和验收点是否准确，再按需补全。' }),
      })
    },
  )
}
