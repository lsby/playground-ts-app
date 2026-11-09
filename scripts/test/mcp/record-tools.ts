import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod-mcp'

import type { 流程说明 } from '../../../src/model/test-requirement'
import type { 测试操作记录 } from '../../../src/test-tools/operation-record'
import { 项目根目录 } from '../../task/model/task-common'
import { 创建工具注册器, 直接返回 } from './register-tool'
import { 无参数模型 } from './tool-input'

export function 注册操作记录工具(
  server: McpServer,
  记录: 测试操作记录,
  获得测试地址: () => { 前端: string; 后端: string },
): void {
  let 注册 = 创建工具注册器(server)
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
    'Declare a deep-equality assertion for a successful tool result. The path starts at the result object, e.g. ["rowCount"]. Use an empty path to compare the whole result.',
    z.strictObject({
      sourceId: 编号模型,
      path: z.array(z.union([z.string(), z.int().nonnegative()])),
      expected: z.json(),
      note: z.string().optional(),
    }),
    async ({ sourceId, path, expected, note }) => 直接返回({ id: await 记录.添加断言(sourceId, path, expected, note) }),
  )
  注册(
    'record_export',
    'Generate a new TypeScript requirement test under test/requirement from the selected record IDs, in the supplied order. Include the earlier tool call for every assertion. Describe how the selected steps prove the acceptance criterion in scenarioApproach. Use a new requirement name, scenario name and file name.',
    z.strictObject({
      ids: z.array(编号模型).min(1).describe('Operation and assertion IDs in the order to run.'),
      fileName: z
        .string()
        .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts$/u)
        .describe('A lowercase kebab-case .ts file name.'),
      requirementName: z.string().trim().min(1),
      requirementDescription: z.string().trim().min(1).optional(),
      acceptanceCriterion: z.string().trim().min(1).describe('What this test must prove.'),
      scenarioName: z.string().trim().min(1),
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
    }),
    async ({
      ids,
      fileName,
      requirementName,
      requirementDescription,
      acceptanceCriterion,
      scenarioName,
      scenarioApproach,
      conclusionNotes,
    }) => {
      let 说明 = { 测试思路: scenarioApproach, 结论补充: conclusionNotes } satisfies Required<流程说明>
      let 条目们 = await Promise.all(ids.map((id) => 记录.获得(id)))
      let { 写出需求测试 } = await import('../requirement/export-file')
      let 路径 = await 写出需求测试(项目根目录, {
        文件名: fileName,
        需求名称: requirementName,
        ...(requirementDescription === undefined ? {} : { 需求描述: requirementDescription }),
        验收点描述: acceptanceCriterion,
        流程名称: scenarioName,
        ...说明,
        条目们,
        测试地址: 获得测试地址(),
      })
      return 直接返回({ path: 路径, scenarioName })
    },
  )
}
