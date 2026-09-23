import { 项目标识 } from '../../../app/meta-info'
import { 环境变量 } from '../../../global/env'
import { 数据库快照 } from '../../../model/local-first/sync-model'
import { 脱敏请求头, 获得请求体摘要 } from './api-log'
import { 解析接口响应 } from './api-response'
import { 本地优先状态键, 读取本地优先状态 } from './local-first-state'

export type 纯前端Worker响应 = { id: number; status: number; body: string }
export type 纯前端Worker请求 =
  | {
      path: string
      headers: Record<string, string>
      method: string
      body: string
      databaseFileName?: string
      localFirstUserId?: string
    }
  | { command: 'reset-admin-password'; password: string; databaseFileName?: string }
  | { command: 'reset-database'; databaseFileName?: string }
  | { command: 'read-sync-pair'; databaseFileName: string; baselineFileName: string; tables: string[] }
  | { command: 'validate-snapshot'; fileName: string; database: 数据库快照 }
  | { command: 'replace-sync-pair'; currentFileName: string; baselineFileName: string; database: 数据库快照 }

type 纯前端Worker命令 = Extract<纯前端Worker请求, { command: string }>

let 纯前端Worker: Worker | undefined
let 纯前端Worker数据库文件名: string | undefined
let 纯前端请求id = 0
let 纯前端等待请求 = new Map<
  number,
  { resolve: (value: 纯前端Worker响应) => void; reject: (reason: unknown) => void }
>()
let 纯前端数据库锁名称 = `${项目标识}-pure-frontend-database`

export function 添加本地优先上下文<
  T extends { path: string; headers: Record<string, string>; method: string; body: string },
>(消息: T): T & { databaseFileName?: string; localFirstUserId?: string } {
  if (环境变量.BUILD_TARGET === 'pure-frontend') return 消息
  let 状态 = 读取本地优先状态()
  if (状态 === undefined) throw new Error('本地优先数据库尚未初始化')
  return { ...消息, databaseFileName: 状态.currentFileName, localFirstUserId: 状态.userId }
}

function 获得纯前端Worker(数据库文件名: string): Worker {
  if (纯前端Worker === undefined) {
    let WorkerURL = new URL('/worker-assets/pure-frontend-api-worker.js', globalThis.location.href)
    WorkerURL.searchParams.set('databaseFileName', 数据库文件名)
    纯前端Worker数据库文件名 = 数据库文件名
    纯前端Worker = new Worker(WorkerURL, { type: 'module', name: `${项目标识}-pure-frontend-sqlite` })
    纯前端Worker.addEventListener('message', (event: MessageEvent<纯前端Worker响应>) => {
      let 等待项 = 纯前端等待请求.get(event.data.id)
      if (等待项 === undefined) return
      纯前端等待请求.delete(event.data.id)
      等待项.resolve(event.data)
    })
    纯前端Worker.addEventListener('error', (event) => {
      结束全部等待请求(event.error ?? new Error('纯前端 Worker 异常终止'))
      纯前端Worker = undefined
      纯前端Worker数据库文件名 = undefined
    })
  }
  if (纯前端Worker数据库文件名 !== 数据库文件名)
    throw new Error(`Worker 已绑定数据库 ${纯前端Worker数据库文件名}，不能切换到 ${数据库文件名}`)
  return 纯前端Worker
}

function 获得Worker数据库文件名(消息: 纯前端Worker请求): string {
  if ('path' in 消息) {
    if (消息.databaseFileName !== undefined) return 消息.databaseFileName
  } else {
    switch (消息.command) {
      case 'reset-admin-password':
      case 'reset-database':
        if (消息.databaseFileName !== undefined) return 消息.databaseFileName
        break
      case 'read-sync-pair':
        return 消息.databaseFileName
      case 'validate-snapshot':
      case 'replace-sync-pair':
        if (纯前端Worker数据库文件名 !== undefined) return 纯前端Worker数据库文件名
        break
    }
  }
  let 环境数据库文件名 = 环境变量.DB_PATH.split(/[/\\]/).pop()
  if (环境数据库文件名 === undefined || 环境数据库文件名 === '') throw new Error('无法从 DB_PATH 获得数据库文件名')
  return `${项目标识}-${环境数据库文件名}`
}

function 结束全部等待请求(原因: unknown): void {
  for (let 等待项 of 纯前端等待请求.values()) 等待项.reject(原因)
  纯前端等待请求.clear()
}

export function 终止纯前端Worker(): void {
  结束全部等待请求(new Error('纯前端 Worker 已终止，请重试当前操作'))
  纯前端Worker?.terminate()
  纯前端Worker = undefined
  纯前端Worker数据库文件名 = undefined
}

function 打印纯前端HTTP日志(
  路径: string,
  方法: string,
  头信息: Record<string, string>,
  请求体: string | FormData,
  响应结果: object | { status: 'unexpected'; data: string },
  耗时毫秒: number,
): void {
  let 状态: unknown = Reflect.get(响应结果, 'status')
  let 是否成功 = 状态 !== 'fail' && 状态 !== 'unexpected'
  let 状态文本 = 是否成功 === true ? '200 OK' : '500 Internal Error'
  let 状态样式 =
    是否成功 === true
      ? 'background: #047857; color: #ffffff; padding: 2px 6px; border-radius: 3px; font-weight: bold;'
      : 'background: #b91c1c; color: #ffffff; padding: 2px 6px; border-radius: 3px; font-weight: bold;'
  console.groupCollapsed(
    `%c[Pure-Frontend HTTP]%c %c${方法}%c ${路径} %c${状态文本}%c (${耗时毫秒.toFixed(1)}ms)`,
    'background: #2563eb; color: #ffffff; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    '',
    'font-weight: bold; color: #3b82f6;',
    '',
    状态样式,
    'color: #888888;',
  )
  console.log('请求头 (Headers):', 脱敏请求头(头信息))
  console.log('请求体 (Body):', 获得请求体摘要(请求体))
  console.log('响应状态 (Response Status):', 状态文本)
  console.groupEnd()
}

export async function 请求纯前端接口(
  path: string,
  headers: Record<string, string>,
  method: string,
  body: string | FormData,
): Promise<object | { status: 'unexpected'; data: string }> {
  if (body instanceof FormData) {
    let 错误结果: { status: 'unexpected'; data: string } = {
      status: 'unexpected',
      data: '纯前端模式暂不支持 FormData 接口',
    }
    打印纯前端HTTP日志(path, method, headers, body, 错误结果, 0)
    return 错误结果
  }
  let 开始时间 = performance.now()
  let 响应结果 = await 使用纯前端数据库锁(() => 请求纯前端Worker(添加本地优先上下文({ path, headers, method, body })))
  打印纯前端HTTP日志(path, method, headers, body, 响应结果, performance.now() - 开始时间)
  return 响应结果
}

export function 请求纯前端命令(命令: 纯前端Worker命令): Promise<object | { status: 'unexpected'; data: string }> {
  return 使用纯前端数据库锁(() => 请求纯前端Worker(命令))
}

export function 使用纯前端数据库锁<T>(任务: () => Promise<T>): Promise<T> {
  if ('locks' in navigator === false) {
    return Promise.reject(new Error('当前浏览器不支持 Web Locks API，无法安全地在多个页面间使用本地数据库'))
  }
  return navigator.locks.request<T>(
    纯前端数据库锁名称,
    { mode: 'exclusive' },
    任务 as unknown as LockGrantedCallback<T>,
  )
}

export async function 请求纯前端Worker(
  消息: 纯前端Worker请求,
): Promise<object | { status: 'unexpected'; data: string }> {
  return 解析接口响应(JSON.parse((await 请求纯前端Worker响应(消息)).body))
}

export function 请求纯前端Worker响应(消息: 纯前端Worker请求): Promise<纯前端Worker响应> {
  let id = ++纯前端请求id
  return new Promise((resolve, reject) => {
    纯前端等待请求.set(id, { resolve, reject })
    try {
      获得纯前端Worker(获得Worker数据库文件名(消息)).postMessage({ id, ...消息 })
    } catch (错误) {
      纯前端等待请求.delete(id)
      reject(错误)
    }
  })
}

window.addEventListener('pagehide', 终止纯前端Worker)
window.addEventListener('storage', (event): void => {
  if (event.key === 本地优先状态键) 终止纯前端Worker()
})
