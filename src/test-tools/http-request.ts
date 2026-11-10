import type { IncomingMessage } from 'node:http'
import { request } from 'node:http'

import { z } from 'zod-mcp'

import { 获得环境变量 } from '../global/env'
import { JSON值模式, type JSON值 } from '../model/data/json-value'
import type { 测试HTTP结果, 测试HTTP请求 } from '../model/test-requirement'

let 最大正文大小 = 65_536
let 测试密码前缀 = '$test-password:'
let 测试密码格式 = /^\$test-password:[a-z0-9-]{1,16}$/i
let 密码字段 = /password|passwd|pwd|密码/i
let 敏感字段 =
  /password|passwd|pwd|token|secret|authorization|cookie|(?:api|access|private|signing|encryption)key|密码|密钥|令牌/i
let 令牌文本 = /\b(?:bearer\s+\S+|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/i
let 已隐藏 = '[REDACTED]'

function 是敏感字段(字段: string): boolean {
  return 敏感字段.test(字段.replace(/[-_\s]/g, ''))
}

function 正文可记录(值: JSON值): boolean {
  if (typeof 值 === 'string') return 令牌文本.test(值) === false
  if (值 === null || typeof 值 !== 'object') return true
  if (Array.isArray(值)) return 值.every(正文可记录)
  return Object.entries(值).every(([字段, 内容]): boolean => {
    if (是敏感字段(字段) === false) return 令牌文本.test(字段) === false && 正文可记录(内容)
    return (
      密码字段.test(字段.replace(/[-_\s]/g, '')) &&
      (内容 === '' || (typeof 内容 === 'string' && 测试密码格式.test(内容)))
    )
  })
}

export let HTTP请求模型 = z
  .strictObject({
    method: z.enum(['GET', 'POST']),
    path: z
      .string()
      .max(512)
      .regex(/^\/api\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/i)
      .describe('API path starting with /api/, without an origin, query, or fragment.'),
    auth: z.literal('test-admin').optional().describe('Log in as the Web test administrator for this request.'),
    body: z
      .json()
      .refine((值) => Buffer.byteLength(JSON.stringify(值)) <= 最大正文大小, 'JSON request body exceeds 64 KiB.')
      .refine(正文可记录, 'Do not send credentials. Use $test-password:<label> in test password fields.')
      .optional()
      .describe(
        'Recorded JSON POST body. Use only synthetic test data. Password fields accept $test-password:<label>.',
      ),
    timeoutMs: z
      .int()
      .min(1)
      .max(30_000)
      .default(5_000)
      .describe('Timeout for login and request together in milliseconds.'),
  })
  .refine(({ method, body }) => method === 'POST' || body === undefined, 'GET requests cannot have a body.')

function 解析测试密码(值: JSON值, 已解析密码: Set<string>): JSON值 {
  if (值 === null || typeof 值 !== 'object') return 值
  if (Array.isArray(值)) return 值.map((项) => 解析测试密码(项, 已解析密码))
  return Object.fromEntries(
    Object.entries(值).map(([字段, 内容]) => {
      if (是敏感字段(字段) && typeof 内容 === 'string' && 测试密码格式.test(内容)) {
        let 密码 = `TestFixture-${内容.slice(测试密码前缀.length)}!`
        已解析密码.add(密码)
        return [字段, 密码]
      }
      return [字段, 解析测试密码(内容, 已解析密码)]
    }),
  )
}

function 隐藏敏感值(值: JSON值, 敏感值: readonly string[], 管理员用户名: string | undefined): JSON值 {
  let 包含敏感值 = (文本: string): boolean => 令牌文本.test(文本) || 敏感值.some((内容) => 文本.includes(内容))
  if (typeof 值 === 'string')
    return 包含敏感值(值) || (管理员用户名 !== undefined && 值.includes(管理员用户名)) ? 已隐藏 : 值
  if (值 === null || typeof 值 !== 'object') return 值
  if (Array.isArray(值)) return 值.map((项) => 隐藏敏感值(项, 敏感值, 管理员用户名))
  return Object.fromEntries(
    Object.entries(值)
      .filter(([字段]) => 包含敏感值(字段) === false)
      .map(([字段, 内容]) => [字段, 是敏感字段(字段) ? 已隐藏 : 隐藏敏感值(内容, 敏感值, 管理员用户名)]),
  )
}

async function 读取JSON响应(响应: IncomingMessage): Promise<JSON值> {
  let 类型 = 响应.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (类型 !== 'application/json' && 类型?.endsWith('+json') !== true) {
    响应.destroy()
    return null
  }
  let 正文: Buffer[] = []
  let 字节数 = 0
  for await (let 数据 of 响应) {
    if (Buffer.isBuffer(数据) === false) throw new Error('收到无效的 HTTP 响应数据')
    字节数 += 数据.length
    if (字节数 > 最大正文大小) throw new Error('HTTP 响应正文超过 64 KiB')
    正文.push(数据)
  }
  if (字节数 === 0) return null
  try {
    return JSON值模式.parse(JSON.parse(Buffer.concat(正文).toString('utf8')))
  } catch {
    throw new Error('HTTP 响应声明了 JSON，但正文不是有效的 JSON')
  }
}

async function 发送请求(
  地址: URL,
  方法: 测试HTTP请求['method'],
  正文: JSON值 | undefined,
  信号: AbortSignal,
  token?: string,
): Promise<测试HTTP结果> {
  let 数据 = 正文 === undefined ? undefined : JSON.stringify(正文)
  let 响应: IncomingMessage
  try {
    响应 = await new Promise<IncomingMessage>((完成, 失败) => {
      let 请求 = request(
        地址,
        {
          method: 方法,
          signal: 信号,
          agent: false,
          headers: {
            accept: 'application/json',
            ...(数据 === undefined
              ? {}
              : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(数据) }),
            ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
          },
        },
        完成,
      )
      请求.once('error', 失败)
      请求.end(数据)
    })
  } catch {
    if (信号.aborted) throw new Error('测试 HTTP 请求已取消或超时')
    throw new Error('连接测试 HTTP 后端失败')
  }
  let status = 响应.statusCode
  if (status === undefined) {
    响应.destroy()
    throw new Error('测试 HTTP 后端未返回状态码')
  }
  try {
    return { status, ok: status >= 200 && status < 300, body: await 读取JSON响应(响应) }
  } catch (错误) {
    if (信号.aborted) throw new Error('测试 HTTP 请求已取消或超时')
    throw 错误
  }
}

let 测试登录结果 = z.object({ status: z.literal('success'), data: z.object({ token: z.string().min(1) }) })

export async function 请求测试后端(
  后端地址: string,
  参数: 测试HTTP请求,
  取消信号们: readonly AbortSignal[],
): Promise<测试HTTP结果> {
  let { method, path, auth, body, timeoutMs } = HTTP请求模型.parse(参数)
  let { APP_PORT, NODE_ENV, BUILD_TARGET, DEFAULT_SYSTEM_USER, DEFAULT_SYSTEM_PWD, DEFAULT_JWT_SECRET } = 获得环境变量()
  let 基础地址 = `http://127.0.0.1:${String(APP_PORT)}`
  if (NODE_ENV !== 'test' || BUILD_TARGET !== 'web' || 后端地址 !== 基础地址)
    throw new Error('HTTP 工具仅允许请求当前本机 Web 测试后端')
  let 信号 = AbortSignal.any([...取消信号们, AbortSignal.timeout(timeoutMs)])
  let 敏感值 = new Set([DEFAULT_SYSTEM_PWD, DEFAULT_JWT_SECRET].filter((值) => 值 !== ''))
  let 发送正文 = body === undefined ? undefined : 解析测试密码(body, 敏感值)
  let token: string | undefined
  if (auth === 'test-admin') {
    if (DEFAULT_SYSTEM_PWD === '') throw new Error('测试管理员认证需要在 Web 测试环境配置 DEFAULT_SYSTEM_PWD')
    let 登录 = await 发送请求(
      new URL('/api/project/login', 基础地址),
      'POST',
      { userName: DEFAULT_SYSTEM_USER, userPassword: DEFAULT_SYSTEM_PWD },
      信号,
    )
    let 结果 = 测试登录结果.safeParse(登录.body)
    if (登录.ok === false || 结果.success === false) throw new Error(`测试管理员登录失败，HTTP ${String(登录.status)}`)
    token = 结果.data.data.token
    敏感值.add(token)
  }
  let 响应 = await 发送请求(new URL(path, 基础地址), method, 发送正文, 信号, token)
  return { ...响应, body: 隐藏敏感值(响应.body, [...敏感值], auth === 'test-admin' ? DEFAULT_SYSTEM_USER : undefined) }
}
