import type { JSON对象 } from '../../../src/test-tools/operation-record'
import { 生成调用代码 } from '../requirement/operation-code'

/** 复用真正的导出器校验能力，避免维护另一份支持工具名单。 */
export function 检查操作回放支持(
  工具: string,
  参数: JSON对象,
  结果: JSON对象,
): { supported: true } | { supported: false; reason: string } {
  try {
    生成调用代码(
      {
        id: 1,
        kind: 'call',
        tool: 工具,
        arguments: 参数,
        notes: null,
        start: '2000-01-01T00:00:00.000Z',
        end: '2000-01-01T00:00:00.000Z',
        status: 'passed',
        result: 结果,
        artifacts: [],
        evidenceErrors: [],
      },
      { 需要结果: false, 测试地址: { 前端: 'http://localhost', 后端: 'http://localhost' } },
    )
    return { supported: true }
  } catch (错误) {
    return { supported: false, reason: 错误 instanceof Error ? 错误.message : String(错误) }
  }
}
