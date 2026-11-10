import type {
  CallToolResult,
  JSONObject,
  McpServer,
  StandardSchemaWithJSON,
  ToolAnnotations,
} from '@modelcontextprotocol/server'
import { z } from 'zod-mcp'

import type { 操作调用结果, 测试操作记录 } from '../../../src/test-tools/operation-record'

export type MCP执行结果<T> = {
  结果: { 成功: true; 值: T } | { 成功: false; 错误: string }
  附件们: readonly { 路径: string; 说明?: string }[]
  取证错误们: readonly string[]
}

export type 工具输出 = { 数据: JSONObject; 图片?: Buffer }

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
    server.registerTool(
      名称,
      {
        description:
          记录 === undefined
            ? 描述
            : `${描述} Automatically recorded. The response includes recordId for review or editing.`,
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
            let 结果数据 = 结果.成功 ? { result: 结果.值.数据 } : { error: 结果.错误 }
            let recordingError: string | undefined
            if (记录 !== undefined && recordId !== undefined) {
              let 调用结果: 操作调用结果 = 结果.成功
                ? { status: 'passed', result: 结果.值.数据, artifacts, evidenceErrors }
                : { status: 'failed', error: 结果.错误, artifacts, evidenceErrors }
              try {
                await 记录.完成(recordId, 调用结果)
              } catch (错误) {
                recordingError = 错误文本(错误)
              }
            }
            let structuredContent = {
              ...结果数据,
              artifacts,
              evidenceErrors,
              ...(recordId === undefined ? {} : { recordId }),
              ...(recordingError === undefined ? {} : { recordingError }),
            }
            let content: CallToolResult['content'] = [{ type: 'text', text: JSON.stringify(structuredContent) }]
            if (结果.成功 && 结果.值.图片 !== undefined)
              content.push({ type: 'image', data: 结果.值.图片.toString('base64'), mimeType: 'image/png' })
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
