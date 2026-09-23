/// <reference lib="webworker" />

import { 任意接口, 执行已匹配接口, 默认请求附加参数 } from '@lsby/net-core'
import bcrypt from 'bcryptjs'
import { Request, Response } from 'express'
import { sql } from 'kysely'
import { 项目标识 } from '../../app/meta-info'
import { 环境变量 } from '../../global/env'
import { globalLog, kysely管理器 } from '../../global/global'
import { init } from '../../init/init'
import { 数据库快照, 数据库快照模式 } from '../../model/local-first/sync-model'
import { 验证密码 } from '../../model/user/user-validation'
import { 设置浏览器运行时数据库文件名 } from '../mock/db-dialect-mock'
import { 创建浏览器数据库管理器, 导入数据库快照, 导出数据库快照, 应用浏览器迁移 } from './browser-database'
import { 本地接口列表 } from './local-api-list'

declare let self: DedicatedWorkerGlobalScope

type 本地API请求 = {
  id: number
  path: string
  method: string
  headers: Record<string, string>
  body: string | null
  databaseFileName?: string
  localFirstUserId?: string
}
type 本地Worker命令 =
  | { id: number; command: 'reset-admin-password'; password: string; databaseFileName?: string }
  | { id: number; command: 'reset-database'; databaseFileName?: string }
  | { id: number; command: 'read-sync-pair'; databaseFileName: string; baselineFileName: string; tables: string[] }
  | { id: number; command: 'validate-snapshot'; fileName: string; database: 数据库快照 }
  | {
      id: number
      command: 'replace-sync-pair'
      currentFileName: string
      baselineFileName: string
      database: 数据库快照
    }
type 本地Worker消息 = 本地API请求 | 本地Worker命令
type 本地API响应 = { id: number; status: number; body: string }
type 运行时 = { 数据库文件名: string; 纯前端已初始化: boolean }

let 运行时: 运行时 | undefined

async function 获得运行时(数据库文件名?: string, 是否应用迁移 = true): Promise<运行时> {
  let 环境数据库文件名 = process.env['DB_PATH']?.split(/[/\\]/).pop() ?? 'local.db'
  let 目标文件名 = 数据库文件名 ?? `${项目标识}-${环境数据库文件名}`
  if (运行时 === undefined) {
    设置浏览器运行时数据库文件名(目标文件名)
    运行时 = { 数据库文件名: 目标文件名, 纯前端已初始化: false }
  }
  if (运行时.数据库文件名 !== 目标文件名)
    throw new Error(`Worker 已绑定数据库 ${运行时.数据库文件名}，不能切换到 ${目标文件名}`)
  if (是否应用迁移 === true) await 应用浏览器迁移(kysely管理器.获得句柄())
  if (环境变量.BUILD_TARGET === 'pure-frontend' && 运行时.纯前端已初始化 === false) {
    await init()
    运行时.纯前端已初始化 = true
  }
  return 运行时
}

self.addEventListener('message', (event: MessageEvent<本地Worker消息>) => {
  let 消息 = event.data
  let 任务 = 'command' in 消息 ? 处理命令(消息) : 处理请求(消息)
  void 任务.then(
    (响应) => self.postMessage(响应),
    (错误: unknown) => {
      let 错误消息 = 错误 instanceof Error ? 错误.message : String(错误)
      self.postMessage({
        id: 消息.id,
        status: 500,
        body: JSON.stringify({ status: 'unexpected', data: `浏览器本地执行异常: ${错误消息}` }),
      } satisfies 本地API响应)
    },
  )
})

async function 创建并导入数据库(文件名: string, 数据库快照: 数据库快照): Promise<void> {
  let 管理器 = 创建浏览器数据库管理器(文件名)
  try {
    await 应用浏览器迁移(管理器.获得句柄())
    await 导入数据库快照(管理器.获得句柄(), 数据库快照)
  } catch (错误) {
    throw new Error(
      `创建并导入浏览器数据库失败 (${JSON.stringify(文件名)}): ${错误 instanceof Error ? 错误.message : String(错误)}`,
      { cause: 错误 },
    )
  } finally {
    await 管理器.销毁()
  }
}

async function 处理命令(命令: 本地Worker命令): Promise<本地API响应> {
  switch (命令.command) {
    case 'read-sync-pair': {
      await 获得运行时(命令.databaseFileName, false)
      let 基线管理器 = 创建浏览器数据库管理器(命令.baselineFileName)
      try {
        let 当前Schema指纹: string | undefined
        let 基线Schema指纹: string | undefined
        let 迁移失败列表: Array<{ database: 'current' | 'baseline'; fileName: string; message: string }> = []
        try {
          当前Schema指纹 = await 应用浏览器迁移(kysely管理器.获得句柄())
        } catch (错误) {
          迁移失败列表.push({
            database: 'current',
            fileName: 命令.databaseFileName,
            message: 错误 instanceof Error ? 错误.message : String(错误),
          })
        }
        try {
          基线Schema指纹 = await 应用浏览器迁移(基线管理器.获得句柄())
        } catch (错误) {
          迁移失败列表.push({
            database: 'baseline',
            fileName: 命令.baselineFileName,
            message: 错误 instanceof Error ? 错误.message : String(错误),
          })
        }
        if (迁移失败列表.length > 0)
          return 本地返回(命令.id, 'fail', { code: 'LOCAL_FIRST_MIGRATION_FAILED', failures: 迁移失败列表 })
        if (当前Schema指纹 === undefined || 基线Schema指纹 === undefined)
          throw new Error('迁移成功后未获得 Schema 指纹')
        let 当前数据库 = await 导出数据库快照(kysely管理器.获得句柄(), 命令.tables)
        let 基线数据库 = await 导出数据库快照(基线管理器.获得句柄(), 命令.tables)
        return 本地返回(命令.id, 'success', { 当前Schema指纹, 基线Schema指纹, 当前数据库, 基线数据库 })
      } finally {
        await 基线管理器.销毁()
      }
    }
    case 'validate-snapshot':
      await 创建并导入数据库(命令.fileName, 数据库快照模式.parse(命令.database))
      return 本地返回(命令.id, 'success', {})
    case 'replace-sync-pair':
      await 创建并导入数据库(命令.currentFileName, 数据库快照模式.parse(命令.database))
      await 创建并导入数据库(命令.baselineFileName, 数据库快照模式.parse(命令.database))
      return 本地返回(命令.id, 'success', {})
    case 'reset-admin-password': {
      await 获得运行时(命令.databaseFileName)
      let 密码错误 = 验证密码(命令.password)
      if (密码错误 !== undefined) return 本地返回(命令.id, 'fail', 密码错误)
      let 管理员 = await kysely管理器
        .获得句柄()
        .selectFrom('user')
        .select('id')
        .where('name', '=', 环境变量.DEFAULT_SYSTEM_USER)
        .executeTakeFirst()
      if (管理员 === undefined) return 本地返回(命令.id, 'unexpected', '未找到本机管理员账号')
      await kysely管理器
        .获得句柄()
        .updateTable('user')
        .set({ pwd: await bcrypt.hash(命令.password, 环境变量.BCRYPT_ROUNDS) })
        .where('id', '=', 管理员.id)
        .execute()
      return 本地返回(命令.id, 'success', {})
    }
    case 'reset-database': {
      await 获得运行时(命令.databaseFileName)
      let 数据库 = kysely管理器.获得句柄()
      await sql`PRAGMA foreign_keys = OFF`.execute(数据库)
      try {
        let 表结果 = await sql<{ name: string }>`
          SELECT name FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'
        `.execute(数据库)
        for (let 表 of 表结果.rows) await sql.raw(`DELETE FROM "${表.name.replaceAll('"', '""')}"`).execute(数据库)
      } finally {
        await sql`PRAGMA foreign_keys = ON`.execute(数据库)
      }
      await init()
      return 本地返回(命令.id, 'success', {})
    }
  }
}

function 本地返回(id: number, status: 'success' | 'fail' | 'unexpected', data: unknown): 本地API响应 {
  return { id, status: 200, body: JSON.stringify({ status, data }) }
}

async function 处理请求(请求: 本地API请求): Promise<本地API响应> {
  await 获得运行时(请求.databaseFileName)
  let url = new URL(请求.path, self.location.origin)
  let 匹配接口: 任意接口 | undefined
  for (let 本地接口 of 本地接口列表) {
    if (
      本地接口.接口.匹配路径(url.pathname) === true &&
      本地接口.接口.获得方法().toLowerCase() === 请求.method.toLowerCase() &&
      (环境变量.BUILD_TARGET === 'pure-frontend' || 本地接口.浏览器支持 === '本地优先')
    ) {
      匹配接口 = 本地接口.接口
      break
    }
  }
  if (匹配接口 === undefined)
    return { id: 请求.id, status: 404, body: JSON.stringify({ status: 'fail', data: '浏览器本地未找到对应接口' }) }

  let body: unknown = {}
  if (请求.body !== null && 请求.body !== '') {
    let contentType = Object.entries(请求.headers).find(([名称]) => 名称.toLowerCase() === 'content-type')?.[1] ?? ''
    body = contentType.includes('application/json') ? (JSON.parse(请求.body) as unknown) : 请求.body
  }
  let 头 = { ...请求.headers }
  if (请求.localFirstUserId !== undefined) 头['x-local-first-user-id'] = 请求.localFirstUserId
  let reqMock: Record<string, unknown> = {
    body,
    query: Object.fromEntries(url.searchParams.entries()),
    headers: 头,
    method: 请求.method,
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
    req: reqMock as unknown as Request,
    res: resMock as unknown as Response,
    目标接口: 匹配接口,
    请求附加参数: { ...默认请求附加参数, log: globalLog.extend(url.pathname), 请求id: String(请求.id) },
  })
  return { id: 请求.id, status: responseStatus, body: JSON.stringify(responseBody) }
}
