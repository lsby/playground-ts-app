import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { createServer, type IncomingMessage } from 'node:http'

import { 注册测试工具, type MCP测试工具宿主 } from './tools'

let 本机地址 = '127.0.0.1'
let MCP路径 = '/mcp'

function 来自本机(请求: IncomingMessage): boolean {
  let 端口 = 请求.socket.localPort
  let 主机们 = 请求.headersDistinct['host']
  if (端口 === undefined || 主机们?.length !== 1) return false
  let 主机 = 主机们[0]?.toLowerCase()
  let 允许主机们 = [`${本机地址}:${String(端口)}`, `localhost:${String(端口)}`]
  if (端口 === 80) 允许主机们.push(本机地址, 'localhost')
  if (主机 === undefined || 允许主机们.includes(主机) === false) return false
  let 来源们 = 请求.headersDistinct['origin']
  return 来源们 === undefined || (来源们.length === 1 && 来源们[0] === new URL(`http://${主机}`).origin)
}

/** HTTP 协议实例按请求创建，浏览器及其他测试工具由开发套件持有。 */
export async function 启动测试MCP(
  宿主: MCP测试工具宿主,
  端口: number,
): Promise<{ 地址: string; 关闭: () => Promise<void> }> {
  let 关闭任务: Promise<void> | undefined
  let 记录错误 = (错误: unknown): void => {
    if (关闭任务 !== undefined && 错误 instanceof Error && 'code' in 错误 && 错误.code === 'ECONNRESET') return
    console.error(错误)
  }
  let MCP处理器 = createMcpHandler(
    () => {
      let MCP = new McpServer({ name: 'playground-test', version: '0.1.0' })
      注册测试工具(MCP, 宿主)
      return MCP
    },
    { legacy: 'stateless', onerror: 记录错误 },
  )
  let 处理请求 = toNodeHandler(MCP处理器, { onerror: 记录错误 })
  let 服务 = createServer((请求, 响应): void => {
    if (来自本机(请求) === false) {
      响应.writeHead(403).end()
      return
    }
    let { method, url } = 请求
    if (url !== MCP路径) {
      响应.writeHead(404).end()
      return
    }
    if (关闭任务 !== undefined) {
      响应.writeHead(503, { Connection: 'close' }).end()
      return
    }
    if (method === undefined) {
      响应.writeHead(400).end()
      return
    }
    let MCP请求 = {
      method,
      url,
      headers: 请求.headers,
      [Symbol.asyncIterator]: (): ReturnType<IncomingMessage[typeof Symbol.asyncIterator]> =>
        请求[Symbol.asyncIterator](),
    }
    void 处理请求(MCP请求, 响应).catch((错误: unknown): void => {
      记录错误(错误)
      if (响应.destroyed) return
      if (响应.headersSent) 响应.destroy()
      else 响应.writeHead(500).end()
    })
  })

  let 结束服务 = async (): Promise<void> => {
    let HTTP关闭 = new Promise<void>((完成, 失败) => {
      服务.close((错误) => {
        if (错误 === undefined) 完成()
        else 失败(错误)
      })
    })
    // SDK 关闭现代流。旧版连接和未读完的请求由 HTTP 服务限时清理。
    let 终止连接 = setTimeout((): void => 服务.closeAllConnections(), 1_000)
    try {
      let 结果们 = await Promise.allSettled([MCP处理器.close(), HTTP关闭])
      let 错误们 = 结果们.filter((结果) => 结果.status === 'rejected').map((结果) => 结果.reason)
      if (错误们.length > 0) throw new AggregateError(错误们, '关闭测试 MCP 失败')
    } finally {
      clearTimeout(终止连接)
    }
  }
  let 关闭 = (): Promise<void> => (关闭任务 ??= 结束服务())

  try {
    await new Promise<void>((完成, 失败) => {
      服务.once('error', 失败)
      服务.listen(端口, 本机地址, () => {
        服务.off('error', 失败)
        完成()
      })
    })
  } catch (错误) {
    await MCP处理器.close()
    throw 错误
  }

  let 地址 = 服务.address()
  if (地址 === null || typeof 地址 === 'string') {
    await 关闭()
    throw new Error('无法取得测试 MCP 的监听端口')
  }
  return { 地址: `http://${本机地址}:${String(地址.port)}${MCP路径}`, 关闭 }
}
