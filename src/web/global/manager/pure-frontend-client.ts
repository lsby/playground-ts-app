import { 项目标识 } from '../../../app/meta-info'
import { 脱敏请求头, 获得请求体摘要 } from './api-log'
import { 解析接口响应 } from './api-response'

export type 纯前端Worker响应 = { id: number; status: number; body: string }
export type 纯前端Worker请求 =
  | { path: string; headers: Record<string, string>; method: string; body: string }
  | { command: 'reset-admin-password'; password: string }
  | { command: 'reset-database' }

type 纯前端Worker命令 = Extract<纯前端Worker请求, { command: string }>

let 纯前端Worker: Worker | undefined
let 纯前端请求id = 0
let 纯前端等待请求 = new Map<
  number,
  { resolve: (value: 纯前端Worker响应) => void; reject: (reason: unknown) => void }
>()
let 纯前端数据库锁名称 = `${项目标识}-pure-frontend-database`

function 获得纯前端Worker(): Worker {
  if (纯前端Worker === undefined) {
    let WorkerURL = new URL('/worker-assets/pure-frontend-api-worker.js', globalThis.location.href)
    let 当前Worker = new Worker(WorkerURL, { type: 'module', name: `${项目标识}-pure-frontend-sqlite` })
    纯前端Worker = 当前Worker
    当前Worker.addEventListener('message', (event: MessageEvent<纯前端Worker响应>) => {
      let 等待项 = 纯前端等待请求.get(event.data.id)
      if (等待项 === undefined) return
      纯前端等待请求.delete(event.data.id)
      等待项.resolve(event.data)
    })
    当前Worker.addEventListener('error', (event) => {
      if (纯前端Worker !== 当前Worker) return
      结束全部等待请求(event.error ?? new Error('纯前端 Worker 异常终止'))
      纯前端Worker = undefined
    })
  }
  return 纯前端Worker
}

function 结束全部等待请求(原因: unknown): void {
  for (let 等待项 of 纯前端等待请求.values()) 等待项.reject(原因)
  纯前端等待请求.clear()
}

export function 终止纯前端Worker(原因: unknown = new Error('纯前端 Worker 已终止，请重试当前操作')): void {
  结束全部等待请求(原因)
  纯前端Worker?.terminate()
  纯前端Worker = undefined
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
  let 响应结果 = await 使用纯前端数据库锁(() => 请求纯前端Worker({ path, headers, method, body }))
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
  let Worker实例: Worker
  try {
    Worker实例 = 获得纯前端Worker()
  } catch (错误) {
    return Promise.reject(错误)
  }
  return new Promise((resolve, reject) => {
    纯前端等待请求.set(id, { resolve, reject })
    try {
      Worker实例.postMessage({ id, ...消息 })
    } catch (错误) {
      纯前端等待请求.delete(id)
      reject(错误)
    }
  })
}

window.addEventListener('pagehide', (): void => {
  终止纯前端Worker(new DOMException('页面已隐藏，纯前端 Worker 已终止', 'AbortError'))
})
