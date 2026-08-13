/// <reference lib="webworker" />

import { 任意接口, 执行已匹配接口, 默认请求附加参数 } from '@lsby/net-core'
import bcrypt from 'bcryptjs'
import { sql } from 'kysely'
import { 环境变量 } from '../global/env'
import { globalLog, kysely管理器, 检查数据库是否可用 } from '../global/global'
import { init } from '../init/init'
import { 已审阅的any } from '../tools/types'
import { 本地接口列表 } from './local-api-list'
import { 初始建表SQL } from './local-schema'

declare let self: DedicatedWorkerGlobalScope

type LocalApiRequest = {
  id: number
  path: string
  method: string
  headers: Record<string, string>
  body: string | null
}

type LocalApiResponse = { id: number; status: number; body: string }
type LocalWorkerCommand =
  | { id: number; command: 'reset-admin-password'; password: string }
  | { id: number; command: 'reset-database' }
type LocalWorkerMessage = LocalApiRequest | LocalWorkerCommand

let initializationPromise: Promise<void> | undefined

function 初始化纯前端(): Promise<void> {
  initializationPromise ??= (async (): Promise<void> => {
    try {
      await 检查数据库是否可用()
    } catch {
      for (let statement of 初始建表SQL
        .split(';')
        .map((item) => item.trim())
        .filter(Boolean)) {
        await sql.raw(statement).execute(kysely管理器.获得句柄())
      }
    }
    await init()
  })()
  return initializationPromise
}

self.addEventListener('message', (event: MessageEvent<LocalWorkerMessage>) => {
  let message = event.data
  let task = 'command' in message ? handleCommand(message) : handleRequest(message)
  void task.then(
    (response) => self.postMessage(response),
    (error: unknown) => {
      let errorMessage = error instanceof Error ? error.message : String(error)
      self.postMessage({
        id: message.id,
        status: 500,
        body: JSON.stringify({ status: 'unexpected', data: `纯前端模式执行异常: ${errorMessage}` }),
      } satisfies LocalApiResponse)
    },
  )
})
async function handleCommand(command: LocalWorkerCommand): Promise<LocalApiResponse> {
  await 初始化纯前端()
  if (command.command === 'reset-admin-password') {
    let password = command.password
    let error = validatePassword(password)
    if (error !== undefined) return localResponse(command.id, 'fail', error)
    let admin = await kysely管理器
      .获得句柄()
      .selectFrom('user')
      .select('id')
      .where('name', '=', 环境变量.DEFAULT_SYSTEM_USER)
      .executeTakeFirst()
    if (admin === undefined) return localResponse(command.id, 'unexpected', '未找到本机管理员账号')
    await kysely管理器
      .获得句柄()
      .updateTable('user')
      .set({ pwd: await bcrypt.hash(password, 环境变量.BCRYPT_ROUNDS) })
      .where('id', '=', admin.id)
      .execute()
    return localResponse(command.id, 'success', {})
  }

  let 数据库 = kysely管理器.获得句柄()
  await sql`PRAGMA foreign_keys = OFF`.execute(数据库)
  try {
    let tables = await sql<{
      name: string
    }>`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`.execute(数据库)
    for (let table of tables.rows) await sql.raw(`DELETE FROM "${table.name.replaceAll('"', '""')}"`).execute(数据库)
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(数据库)
  }
  await init()
  return localResponse(command.id, 'success', {})
}

function validatePassword(password: string): string | undefined {
  if (password.includes(' ')) return '密码不能包含空格'
  if (password === '') return '密码不能为空'
  if (password.length < 6) return '密码过短'
  if (password.length > 32) return '密码过长'
  return undefined
}

function localResponse(id: number, status: 'success' | 'fail' | 'unexpected', data: unknown): LocalApiResponse {
  return { id, status: 200, body: JSON.stringify({ status, data }) }
}
async function handleRequest(request: LocalApiRequest): Promise<LocalApiResponse> {
  await 初始化纯前端()
  let url = new URL(request.path, self.location.origin)
  let matchedApi: 任意接口 | undefined
  for (let api of 本地接口列表) {
    if (api.匹配路径(url.pathname) === true && api.获得方法().toLowerCase() === request.method.toLowerCase()) {
      matchedApi = api
      break
    }
  }
  if (matchedApi === undefined) {
    console.warn(
      '[pure-frontend] unavailable local API: ' +
        request.method +
        ' ' +
        url.pathname +
        '. Mark it with { 支持纯前端模式: true } and ensure its dependencies run in a browser Worker.',
    )
    return {
      id: request.id,
      status: 404,
      body: JSON.stringify({ status: 'fail', data: '纯前端模式未找到对应的本地接口' }),
    }
  }

  let body: unknown = {}
  if (request.body !== null && request.body !== '') {
    let contentType = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1] ?? ''
    body = contentType.includes('application/json') ? (JSON.parse(request.body) as unknown) : request.body
  }
  let reqMock: Record<string, unknown> = {
    body,
    query: Object.fromEntries(url.searchParams.entries()),
    headers: request.headers,
    method: request.method,
    path: url.pathname,
    ip: '127.0.0.1',
  }
  let responseBody: unknown = null
  let responseStatus = 200
  type ResponseMock = {
    status: (code: number) => ResponseMock
    json: (data: unknown) => ResponseMock
    send: (data: unknown) => ResponseMock
    end: () => ResponseMock
    setHeader: () => ResponseMock
  }
  let resMock: ResponseMock = {
    status: (code) => {
      responseStatus = code
      return resMock
    },
    json: (data) => {
      responseBody = data
      return resMock
    },
    send: (data) => {
      responseBody = data
      return resMock
    },
    end: () => resMock,
    setHeader: () => resMock,
  }
  await 执行已匹配接口({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    req: reqMock as 已审阅的any,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    res: resMock as 已审阅的any,
    目标接口: matchedApi,
    请求附加参数: { ...默认请求附加参数, log: globalLog.extend(url.pathname), 请求id: String(request.id) },
  })
  return { id: request.id, status: responseStatus, body: JSON.stringify(responseBody) }
}
