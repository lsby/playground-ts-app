import { z } from 'zod-mcp'

import type { 流程说明 } from '../../../src/model/test-requirement'
import type { 测试操作记录 } from '../../../src/test-tools/operation-record'
import { 项目根目录 } from '../../task/model/task-common'
import { 需求流程文件名格式, 需求目录名格式 } from '../requirement/requirement-file'
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
    'List operation and assertion summaries in the current order. Use record_get for parameters, results and evidence.',
    z.strictObject({ offset: z.int().nonnegative().default(0), limit: z.int().positive().default(50) }),
    async ({ offset, limit }) => 直接返回(await 记录.列出(offset, limit)),
    只读,
  )
  注册(
    'record_get',
    'Read an operation or assertion by its stable record ID.',
    z.strictObject({ id: 编号模型 }),
    async ({ id }) => 直接返回({ entry: await 记录.获得(id) }),
    只读,
  )
  注册(
    'record_note',
    'Add a step title or a short decision note to a selected operation or assertion. When useful, say what you observed, what you chose to do or check, and why the check matters. Export shows decision notes on the relevant report step. Pass null to clear either field.',
    z
      .strictObject({
        id: 编号模型,
        note: z.string().nullable().optional().describe('Optional title for the exported step.'),
        decision: z
          .string()
          .trim()
          .min(1)
          .nullable()
          .optional()
          .describe('Optional evidence-based explanation for the report.'),
      })
      .refine(({ note, decision }) => note !== undefined || decision !== undefined, 'Provide note or decision.'),
    async ({ id, note, decision }) => {
      await 记录.更新说明(id, note, decision)
      return 直接返回({ id })
    },
  )
  注册(
    'record_remove',
    'Remove entries from the record by ID. The browser and database state are untouched.',
    z.strictObject({ ids: z.array(编号模型).min(1) }),
    async ({ ids }) => {
      await 记录.删除(ids)
      return 直接返回({ ids })
    },
  )
  注册(
    'record_move',
    'Move an entry before another entry. Use null to move it to the end.',
    z.strictObject({ id: 编号模型, beforeId: 编号模型.nullable() }),
    async ({ id, beforeId }) => {
      await 记录.移动(id, beforeId)
      return 直接返回({ id, beforeId })
    },
  )
  注册(
    'record_clear',
    'Clear the editable operation record. Browser and database state are untouched.',
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
    'Generate one requirement test scenario from a previously created requirement description file. Use steps for new exports and write concise Chinese business titles for the scenario and every step. Combine consecutive calls that serve the same business action into one step. For example, opening the login page, filling credentials, submitting and waiting for navigation can be grouped as “管理员登录”. Keep distinct verification outcomes as separate observations, such as “确认重名提示” and “核对新账号权限”. Do not use tool names such as browser_fill as step titles. For asynchronous UI outcomes, record and replay a targeted browser_wait or browser_wait_url for the expected result. Use whole-page snapshots to explore the UI. Keep actions and checks in replay order, include the earlier tool call for each assertion, and omit exploratory calls unnecessary for replay. Describe how the steps prove the selected acceptance criteria in scenarioApproach.',
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
          .describe('Business steps in replay order. Include at least one observation group containing only checks.'),
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
          .regex(需求目录名格式)
          .describe(
            'An existing lowercase kebab-case directory name, e.g. checkout for test/requirement/checkout/index.requirement.ts.',
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
      .refine(({ ids, steps }) => (ids === undefined) !== (steps === undefined), 'Provide either steps or ids.'),
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
      let 分组们 = steps ?? ids?.map((id) => ({ title: undefined, ids: [id] }))
      if (分组们 === undefined) throw new Error('缺少导出步骤')
      let 步骤组 = await Promise.all(
        分组们.map(async ({ title, ids: 条目编号们 }) => ({
          名称: title,
          条目们: await Promise.all(条目编号们.map((id) => 记录.获得(id))),
        })),
      )
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
