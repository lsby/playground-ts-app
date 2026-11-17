import type {
  CallToolResult,
  JSONObject,
  McpServer,
  StandardSchemaWithJSON,
  ToolAnnotations,
} from '@modelcontextprotocol/server'
import { z } from 'zod-mcp'

import type { 测试建议 } from '../../../src/model/test-requirement'
import type { 录制增强, 操作调用结果, 测试操作记录 } from '../../../src/test-tools/operation-record'
import { 检查操作回放支持 } from './replay-support'

export type MCP执行结果<T> = {
  结果: { 成功: true; 值: T } | { 成功: false; 错误: string }
  附件们: readonly { 路径: string; 说明?: string }[]
  取证错误们: readonly string[]
}

/** `图片` 是干净证据；有 `模型图片`（带刻度）时返回给模型的是它。 */
export type 工具图片 = { 图片: Buffer; 模型图片?: Buffer; 内容类型: 'image/png' | 'image/webp'; 说明: string }
/** 录制时自动补充的回放信息；模板图片由注册器存进记录目录，再把路径写进录制。 */
export type 录制增强输出 = Omit<录制增强, '模板'> & {
  模板?: Omit<NonNullable<录制增强['模板']>, '文件'> & { 图片: Buffer }
}
/**
 * `数据` 会记进操作记录；观察元数据与图片只返回给调用方，图片另存为证据附件。
 * `录制增强` 和 `建议们` 也会记进这条操作记录，但不属于业务结果，不会被断言引用。
 */
export type 工具输出 = {
  数据: JSONObject
  图片们?: readonly 工具图片[]
  响应附加?: JSONObject
  录制增强?: 录制增强输出
  建议们?: readonly 测试建议[]
}

export type 工具注册函数 = <参数类型>(
  名称: string,
  描述: string,
  参数模型: StandardSchemaWithJSON<unknown, 参数类型>,
  执行: (参数: 参数类型, 取消信号: AbortSignal) => Promise<MCP执行结果<工具输出>>,
  注解?: ToolAnnotations,
) => void

type 工具调用保护 = <结果>(调用: () => Promise<结果>) => Promise<结果>

let 操作参数模型 = z.record(z.string(), z.json())

export function 直接返回(数据: JSONObject): MCP执行结果<工具输出> {
  return { 结果: { 成功: true, 值: { 数据 } }, 附件们: [], 取证错误们: [] }
}

function 错误文本(错误: unknown): string {
  return 错误 instanceof Error ? 错误.message : String(错误)
}

export function 创建工具注册器(server: McpServer, 保护: 工具调用保护, 记录?: 测试操作记录): 工具注册函数 {
  return (名称, 描述, 参数模型, 执行, 注解): void => {
    let 截图说明 = 名称.endsWith('_screenshot')
      ? ' Actions already return selected screen images. Capture a fresh image only when you need a newer screen or the action observation failed.'
      : ''
    server.registerTool(
      名称,
      {
        description:
          记录 === undefined
            ? `${描述}${截图说明}`
            : `${描述}${截图说明} Automatically recorded. The response includes recordId for review or editing and replay.supported checked by the exporter. Unsupported actions are evidence only; exclude them from replay. Screen observations are evidence, not readiness assertions.`,
        inputSchema: 参数模型,
        ...(注解 === undefined ? {} : { annotations: 注解 }),
      },
      async (参数, 上下文): Promise<CallToolResult> => {
        try {
          return await 保护(async (): Promise<CallToolResult> => {
            let recordId: number | undefined
            let 执行结果: MCP执行结果<工具输出>
            try {
              if (记录 !== undefined) recordId = await 记录.开始(名称, 操作参数模型.parse(参数))
              执行结果 = await 执行(参数, 上下文.mcpReq.signal)
            } catch (错误) {
              执行结果 = { 结果: { 成功: false, 错误: 错误文本(错误) }, 附件们: [], 取证错误们: [] }
            }
            let { 结果, 附件们, 取证错误们 } = 执行结果
            let artifacts = 附件们.map(({ 路径, 说明 }) => ({
              path: 路径,
              ...(说明 === undefined ? {} : { description: 说明 }),
            }))
            let evidenceErrors = [...取证错误们]
            let 结果数据 = 结果.成功 ? { result: { ...结果.值.数据, ...结果.值.响应附加 } } : { error: 结果.错误 }
            let recordingError: string | undefined
            if (记录 !== undefined && recordId !== undefined) {
              let 增强: 录制增强 | undefined
              let 输出增强 = 结果.成功 ? 结果.值.录制增强 : undefined
              if (输出增强 !== undefined) {
                let { 模板, ...其余 } = 输出增强
                增强 = 其余
                if (模板 !== undefined) {
                  let { 图片, ...模板信息 } = 模板
                  try {
                    增强 = { ...增强, 模板: { ...模板信息, 文件: await 记录.保存模板(recordId, 图片) } }
                  } catch (错误) {
                    evidenceErrors.push(`保存图片模板失败：${错误文本(错误)}`)
                  }
                }
              }
              let 调用结果: 操作调用结果 = 结果.成功
                ? {
                    status: 'passed',
                    result: 结果.值.数据,
                    artifacts,
                    evidenceErrors,
                    ...(增强 === undefined || Object.keys(增强).length === 0 ? {} : { 增强 }),
                  }
                : { status: 'failed', error: 结果.错误, artifacts, evidenceErrors }
              try {
                await 记录.完成(recordId, 调用结果)
                if (结果.成功) for (let 建议 of 结果.值.建议们 ?? []) await 记录.添加建议(recordId, 建议)
              } catch (错误) {
                recordingError = 错误文本(错误)
              }
            }
            let structuredContent = {
              ...结果数据,
              artifacts,
              evidenceErrors,
              ...(recordId === undefined ? {} : { recordId }),
              ...(recordId === undefined || 结果.成功 === false
                ? {}
                : { replay: 检查操作回放支持(名称, 操作参数模型.parse(参数), 结果.值.数据) }),
              ...(recordingError === undefined ? {} : { recordingError }),
            }
            let content: CallToolResult['content'] = [{ type: 'text', text: JSON.stringify(structuredContent) }]
            if (结果.成功)
              for (let 图片 of 结果.值.图片们 ?? []) {
                content.push({ type: 'text', text: 图片.说明 })
                content.push({
                  type: 'image',
                  data: (图片.模型图片 ?? 图片.图片).toString('base64'),
                  mimeType: 图片.内容类型,
                })
              }
            return { content, structuredContent, ...(结果.成功 ? {} : { isError: true }) }
          })
        } catch (错误) {
          let structuredContent = { error: 错误文本(错误), artifacts: [], evidenceErrors: [] }
          return {
            content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
            structuredContent,
            isError: true,
          }
        }
      },
    )
  }
}
