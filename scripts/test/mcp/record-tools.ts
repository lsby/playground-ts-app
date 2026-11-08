import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod-mcp'

import type { 测试操作记录 } from '../../../src/test-tools/operation-record'
import { 创建工具注册器, 直接返回 } from './register-tool'
import { 无参数模型 } from './tool-input'

export function 注册操作记录工具(server: McpServer, 记录: 测试操作记录): void {
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
    'Set an explanatory note on a record. Use null to remove it.',
    z.strictObject({ id: 编号模型, note: z.string().nullable() }),
    async ({ id, note }) => {
      await 记录.更新说明(id, note)
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
}
