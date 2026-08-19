import { web请求 } from '@lsby/ts-http-extend'
import { 环境变量 } from '../../../global/env'
import { 已审阅的any } from '../../../tools/types'
import { InterfaceType } from '../../../types/interface-type'
import { 错误提示 } from '../manager/toast-manager'

export type 取接口<
  P extends InterfaceType[number]['path'],
  T extends readonly 已审阅的any[] = InterfaceType,
> = T extends readonly [infer F, ...infer Rest] ? (F extends { path: P } ? F : 取接口<P, Rest>) : never

type 取JSON输入<I> = I extends { input: { json: infer 输入 } } ? 输入 : never
type 取FORM输入<I> = I extends { input: { form: infer 输入 } } ? 输入 : never

type 取http错误输出<I> = I extends { errorOutput: infer 输出 } ? 输出 : never
type 取http正确输出<I> = I extends { successOutput: infer 输出 } ? 输出 : never
type 取http正确输出数据<I> = I extends { successOutput: { data: infer 输出 } } ? 输出 : never

type 取ws输出<I> = I extends { wsOutput: infer 输出 } ? 输出 : never
type 取ws输入<I> = I extends { wsInput: infer 输入 } ? 输入 : never

type 所有POST_JSON路径 = InterfaceType extends readonly (infer Item)[]
  ? Item extends { method: 'post'; path: infer P; input: { json: infer json } }
    ? json extends never
      ? never
      : P
    : never
  : never
type 所有FORM路径 = InterfaceType extends readonly (infer Item)[]
  ? Item extends { method: 'post'; path: infer P }
    ? P
    : never
  : never

let API前缀 = ''
let serviceWorkerReady: Promise<void> | undefined

export class API管理器类 {
  private 本地存储名称 = 'lsby-api-component-base-token'
  private token: string | null = null

  public constructor() {
    let storedToken = localStorage.getItem(this.本地存储名称)
    if (storedToken !== null) {
      this.token = storedToken
    }
  }

  public 设置token(token: string): void {
    this.token = token
    localStorage.setItem(this.本地存储名称, token)
  }
  public 清除token(): void {
    this.token = null
    localStorage.removeItem(this.本地存储名称)
  }

  public async 请求postJson<接口路径 extends 所有POST_JSON路径>(
    接口路径: 接口路径,
    参数: 取JSON输入<取接口<接口路径>>,
    ws输出回调?: (data: 取ws输出<取接口<接口路径>>) => Promise<void>,
    ws连接回调?: (发送消息: (data: 取ws输入<取接口<接口路径>>) => void, ws: WebSocket) => Promise<void>,
    ws关闭回调?: (e: CloseEvent) => Promise<void>,
    ws错误回调?: (e: Event) => Promise<void>,
  ): Promise<
    取http错误输出<取接口<接口路径>> | 取http正确输出<取接口<接口路径>> | { status: 'unexpected'; data: string }
  > {
    return (await this.通用请求(
      接口路径,
      { 'Content-Type': 'application/json' },
      'POST',
      JSON.stringify(参数),
      ws输出回调,
      ws连接回调,
      ws关闭回调,
      ws错误回调,
    )) as 已审阅的any
  }
  public async 请求postJson并处理错误<接口路径 extends 所有POST_JSON路径>(
    接口路径: 接口路径,
    参数: 取JSON输入<取接口<接口路径>>,
    ws输出回调?: (data: 取ws输出<取接口<接口路径>>) => Promise<void>,
    ws连接回调?: (发送消息: (data: 取ws输入<取接口<接口路径>>) => void, ws: WebSocket) => Promise<void>,
    ws关闭回调?: (e: CloseEvent) => Promise<void>,
    ws错误回调?: (e: Event) => Promise<void>,
  ): Promise<取http正确输出数据<取接口<接口路径>>> {
    return (await this.通用请求并处理错误(
      接口路径,
      async () =>
        (await this.请求postJson(接口路径, 参数, ws输出回调, ws连接回调, ws关闭回调, ws错误回调)) as 已审阅的any,
    )) as 已审阅的any
  }

  public async 请求form<P extends 所有FORM路径>(
    路径: P,
    formData: 取FORM输入<取接口<P>>,
    ws输出回调?: (data: 取ws输出<取接口<P>>) => Promise<void>,
    ws连接回调?: (发送消息: (data: 取ws输入<取接口<P>>) => void, ws: WebSocket) => Promise<void>,
    ws关闭回调?: (e: CloseEvent) => Promise<void>,
    ws错误回调?: (e: Event) => Promise<void>,
  ): Promise<取http错误输出<取接口<P>> | 取http正确输出<取接口<P>> | { status: 'unexpected'; data: string }> {
    return (await this.通用请求(
      路径,
      {},
      'POST',
      formData,
      ws输出回调,
      ws连接回调,
      ws关闭回调,
      ws错误回调,
    )) as 已审阅的any
  }
  public async 请求form并处理错误<P extends 所有FORM路径>(
    路径: P,
    formData: 取FORM输入<取接口<P>>,
    ws输出回调?: (data: 取ws输出<取接口<P>>) => Promise<void>,
    ws连接回调?: (发送消息: (data: 取ws输入<取接口<P>>) => void, ws: WebSocket) => Promise<void>,
    ws关闭回调?: (e: CloseEvent) => Promise<void>,
    ws错误回调?: (e: Event) => Promise<void>,
  ): Promise<取http正确输出数据<取接口<P>>> {
    return (await this.通用请求并处理错误(
      路径,
      async () => (await this.请求form(路径, formData, ws输出回调, ws连接回调, ws关闭回调, ws错误回调)) as 已审阅的any,
    )) as 已审阅的any
  }

  public async 重置纯前端管理员密码(password: string): Promise<void> {
    if (环境变量.BUILD_TARGET !== 'pure-frontend') throw new Error('仅纯前端模式支持本机管理员密码重设')
    let result = await requestPureFrontendCommand({ command: 'reset-admin-password', password })
    if (this.是标准返回格式(result) === false || result.status !== 'success')
      throw new Error(this.是标准返回格式(result) ? String(result.data) : '重设管理员密码失败')
  }

  public async 重置纯前端数据库(): Promise<void> {
    if (环境变量.BUILD_TARGET !== 'pure-frontend') throw new Error('仅纯前端模式支持本机数据库重置')
    let result = await requestPureFrontendCommand({ command: 'reset-database' })
    if (this.是标准返回格式(result) === false || result.status !== 'success')
      throw new Error(this.是标准返回格式(result) ? String(result.data) : '重置本机数据库失败')
  }
  private async 通用请求(
    接口路径: string,
    头: { [key: string]: string },
    方法: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
    body: string | FormData,
    ws输出回调?: (data: 已审阅的any) => Promise<void>,
    ws连接回调?: (发送消息: (data: 已审阅的any) => void, ws: WebSocket) => Promise<void>,
    ws关闭回调?: (e: CloseEvent) => Promise<void>,
    ws错误回调?: (e: Event) => Promise<void>,
  ): Promise<object | { status: 'unexpected'; data: string }> {
    let 请求结果: string | null = null
    try {
      if (this.token !== null) {
        头['authorization'] = 'Bearer ' + this.token
      }

      let ws回调选项: Record<string, 已审阅的any> = {
        ...(ws输出回调 !== undefined
          ? {
              ws信息回调: async (e: MessageEvent): Promise<void> => {
                await ws输出回调(JSON.parse(e.data))
              },
            }
          : {}),
        ...(ws关闭回调 !== undefined ? { ws关闭回调: ws关闭回调 } : {}),
        ...(ws错误回调 !== undefined ? { ws错误回调: ws错误回调 } : {}),
        ...(ws连接回调 !== undefined
          ? {
              ws连接回调: async (ws: WebSocket): Promise<void> => {
                let 发送消息 = (data: 已审阅的any): void => {
                  ws.send(JSON.stringify(data))
                }
                await ws连接回调(发送消息, ws)
              },
            }
          : {}),
      }

      // console.log('请求:\n路径: %o\n头: %o\n方法: %o\nbody: %o\n结果: %o', 接口路径, 头, 方法, body, 请求结果)
      if (环境变量.BUILD_TARGET === 'pure-frontend') {
        return await requestPureFrontendApi(接口路径, 头, 方法, body)
      }
      if (serviceWorkerReady !== undefined) await serviceWorkerReady

      请求结果 = await web请求({
        url: API前缀 + 接口路径,
        body: body,
        headers: 头,
        method: 方法,
        ws路径: '/ws',
        wsId参数键: 'id',
        wsId头键: 'ws-client-id',
        ...ws回调选项,
      })
      return JSON.parse(请求结果)
    } catch (e) {
      console.error('请求错误:\n路径: %o\n头: %o\n方法: %o\nbody: %o\n结果: %o', 接口路径, 头, 方法, body, 请求结果)
      return { status: 'unexpected', data: String(e) }
    }
  }
  private async 通用请求并处理错误(
    接口路径: string,
    请求函数: () => Promise<object | { status: 'unexpected'; data: string }>,
  ): Promise<object> {
    let 请求结果 = await 请求函数()
    if (this.是标准返回格式(请求结果) === false) return 请求结果

    if (请求结果.status === 'fail' || 请求结果.status === 'unexpected') {
      let 错误详情: string =
        typeof 请求结果.data === 'object' && 请求结果.data !== null
          ? JSON.stringify(请求结果.data)
          : String(请求结果.data)
      let 提示 = `请求接口失败: ${接口路径}: ${错误详情}`
      错误提示(提示)
      throw new Error(提示)
    }
    return 请求结果.data as 已审阅的any
  }

  private 是标准返回格式(
    x: unknown,
  ): x is
    | { status: 'fail'; data: 已审阅的any }
    | { status: 'success'; data: Record<string, 已审阅的any> }
    | { status: 'unexpected'; data: 已审阅的any } {
    return typeof x === 'object' && x !== null && 'status' in x && 'data' in x
  }
}

export let API管理器 = new API管理器类()

if ('serviceWorker' in navigator && 环境变量.BUILD_TARGET === 'pure-frontend') {
  serviceWorkerReady = navigator.serviceWorker
    .register(new URL('../../sw.ts', import.meta.url), { type: 'module' })
    .then(() => {
      console.log('✅ ServiceWorker 注册成功')
    })
}

type PureFrontendWorkerResponse = { id: number; status: number; body: string }

let pureFrontendWorker: Worker | undefined
let pureFrontendRequestId = 0
let pureFrontendPendingRequests = new Map<
  number,
  { resolve: (value: object | { status: 'unexpected'; data: string }) => void; reject: (reason: unknown) => void }
>()
let pureFrontendDatabaseLockName = 'lsby-pure-frontend:local.db'

type PureFrontendWorkerRequest =
  | { path: string; headers: Record<string, string>; method: string; body: string }
  | { command: 'reset-admin-password'; password: string }
  | { command: 'reset-database' }

function getPureFrontendWorker(): Worker {
  if (pureFrontendWorker === undefined) {
    pureFrontendWorker = new Worker(new URL('../../pure-frontend-api-worker.ts', import.meta.url), {
      type: 'module',
      name: 'lsby-pure-frontend-sqlite',
    })
    pureFrontendWorker.addEventListener('message', (event: MessageEvent<PureFrontendWorkerResponse>) => {
      let pending = pureFrontendPendingRequests.get(event.data.id)
      if (pending === undefined) return
      pureFrontendPendingRequests.delete(event.data.id)
      try {
        pending.resolve(JSON.parse(event.data.body) as object)
      } catch (error: unknown) {
        pending.reject(error)
      }
    })
    pureFrontendWorker.addEventListener('error', (event) => {
      for (let pending of pureFrontendPendingRequests.values()) pending.reject(event.error)
      pureFrontendPendingRequests.clear()
    })
  }
  return pureFrontendWorker
}

if (环境变量.BUILD_TARGET === 'pure-frontend') {
  window.addEventListener('pagehide', () => {
    pureFrontendWorker?.terminate()
    pureFrontendWorker = undefined
  })
}
function 打印纯前端HTTP日志(
  路径: string,
  方法: string,
  头信息: Record<string, string>,
  请求体: string | FormData,
  响应结果: object | { status: 'unexpected'; data: string },
  耗时毫秒: number,
): void {
  let 是否成功 = false
  if (
    typeof 响应结果 === 'object' &&
    'status' in 响应结果 &&
    (响应结果 as { status: unknown }).status !== 'fail' &&
    (响应结果 as { status: unknown }).status !== 'unexpected'
  ) {
    是否成功 = true
  }

  let 状态文本 = 是否成功 === true ? '200 OK' : '500 Internal Error'
  let 状态样式 =
    是否成功 === true
      ? 'background: #047857; color: #ffffff; padding: 2px 6px; border-radius: 3px; font-weight: bold;'
      : 'background: #b91c1c; color: #ffffff; padding: 2px 6px; border-radius: 3px; font-weight: bold;'

  let 耗时文本 = 耗时毫秒.toFixed(1) + 'ms'

  console.groupCollapsed(
    `%c[Pure-Frontend HTTP]%c %c${方法}%c ${路径} %c${状态文本}%c (${耗时文本})`,
    'background: #2563eb; color: #ffffff; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    '',
    'font-weight: bold; color: #3b82f6;',
    '',
    状态样式,
    'color: #888888;',
  )

  console.log('请求头 (Headers):', 头信息)

  if (typeof 请求体 === 'string' && 请求体.length > 0) {
    try {
      console.log('请求体 (Body):', JSON.parse(请求体))
    } catch {
      console.log('请求体 (Body):', 请求体)
    }
  } else {
    console.log('请求体 (Body):', 请求体)
  }

  console.log('响应体 (Response):', 响应结果)

  console.groupEnd()
}

async function requestPureFrontendApi(
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
  let 响应结果 = await withPureFrontendDatabaseLock(() => requestPureFrontendWorker({ path, headers, method, body }))
  let 耗时毫秒 = performance.now() - 开始时间
  打印纯前端HTTP日志(path, method, headers, body, 响应结果, 耗时毫秒)
  return 响应结果
}

type PureFrontendWorkerCommand = Extract<PureFrontendWorkerRequest, { command: string }>

function requestPureFrontendCommand(
  command: PureFrontendWorkerCommand,
): Promise<object | { status: 'unexpected'; data: string }> {
  return withPureFrontendDatabaseLock(() => requestPureFrontendWorker(command))
}

function withPureFrontendDatabaseLock<T>(task: () => Promise<T>): Promise<T> {
  if ('locks' in navigator === false) {
    return Promise.reject(new Error('当前浏览器不支持 Web Locks API，无法安全地在多个页面间使用本地数据库'))
  }
  // 锁覆盖一次本地 API 或管理命令的完整执行过程。每个标签页可以拥有自己的
  // 长生命周期 Worker，但任意时刻只有一个标签页可以操作 IndexedDB 中的 SQLite。
  return navigator.locks.request<T>(
    pureFrontendDatabaseLockName,
    { mode: 'exclusive' },
    task as unknown as LockGrantedCallback<T>,
  )
}

function requestPureFrontendWorker(
  message: PureFrontendWorkerRequest,
): Promise<object | { status: 'unexpected'; data: string }> {
  let id = ++pureFrontendRequestId
  return new Promise((resolve, reject) => {
    pureFrontendPendingRequests.set(id, { resolve, reject })
    getPureFrontendWorker().postMessage({ id, ...message })
  })
}
