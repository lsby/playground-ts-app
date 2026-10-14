import { web请求 } from '@lsby/ts-http-extend'
import { z } from 'zod'
import { 项目标识 } from '../../../app/meta-info'
import { 环境变量 } from '../../../global/env'
import { JSON对象模式 } from '../../../model/json-value'
import { 已审阅的any } from '../../../tools/types'
import { InterfaceType } from '../../../types/interface-type'
import { 错误提示 } from '../manager/toast-manager'
import { 是中止错误, 等待可取消任务 } from '../tools/abort'
import { 脱敏请求头, 获得请求体摘要, 获得错误摘要 } from './api-log'
import { 是标准接口响应, 解析接口响应 } from './api-response'
export type API请求选项 = { 信号?: AbortSignal }

export type 取接口<
  P extends InterfaceType[number]['path'],
  T extends readonly 已审阅的any[] = InterfaceType,
> = T extends readonly [infer F, ...infer Rest] ? (F extends { path: P } ? F : 取接口<P, Rest>) : never

type 取JSON输入<I> = I extends { input: { json: infer 输入 } } ? 输入 : never
type 取FORM输入<I> = I extends { input: { form: infer 输入 } } ? 输入 : never
type 取QUERY输入<I> = I extends { input: { query: infer 输入 } } ? 输入 : never

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
type 所有GET文本路径 = InterfaceType extends readonly (infer Item)[]
  ? Item extends { method: 'get'; path: infer P; errorOutput: string; successOutput: string }
    ? P
    : never
  : never
type GET查询参数组<接口路径 extends 所有GET文本路径> = [取QUERY输入<取接口<接口路径>>] extends [never]
  ? []
  : [参数: 取QUERY输入<取接口<接口路径>>]
let API前缀 = 环境变量.BACKEND_URL.replace(/\/+$/, '')
export class API管理器类 {
  private 本地存储名称 = `${项目标识}-api-token`
  private token: string | null = null
  public constructor() {
    let storedToken = localStorage.getItem(this.本地存储名称)
    if (storedToken !== null) this.token = storedToken
  }

  public 设置token(token: string): Promise<void> {
    this.token = token
    localStorage.setItem(this.本地存储名称, token)
    return Promise.resolve()
  }
  public 清除token(): Promise<void> {
    this.token = null
    localStorage.removeItem(this.本地存储名称)
    return Promise.resolve()
  }

  public 已设置token(): boolean {
    return this.token !== null
  }

  public async 请求get文本<接口路径 extends 所有GET文本路径>(
    接口路径: 接口路径,
    ...参数组: GET查询参数组<接口路径>
  ): Promise<
    | { status: 'success'; data: 取http正确输出<取接口<接口路径>> }
    | { status: 'fail'; data: 取http错误输出<取接口<接口路径>> }
    | { status: 'unexpected'; data: string }
  > {
    let 查询参数 = 参数组[0]
    let 查询字符串 = 查询参数 === undefined ? '' : new URLSearchParams(查询参数 as 已审阅的any).toString()
    let 完整路径 = 查询字符串 === '' ? 接口路径 : `${接口路径}?${查询字符串}`
    let 头: Record<string, string> = {}
    if (this.token !== null) 头['authorization'] = 'Bearer ' + this.token

    try {
      if (环境变量.BUILD_TARGET === 'pure-frontend') {
        let { 使用纯前端数据库锁, 请求纯前端Worker响应 } = await import('./pure-frontend-client')
        let 响应 = await 使用纯前端数据库锁(() =>
          请求纯前端Worker响应({ path: 完整路径, headers: 头, method: 'GET', body: '' }),
        )
        let 数据 = z.string().parse(JSON.parse(响应.body))
        return { status: 响应.status >= 200 && 响应.status < 300 ? 'success' : 'fail', data: 数据 } as 已审阅的any
      }

      let 响应 = await fetch(API前缀 + 完整路径, { method: 'GET', headers: 头 })
      return { status: 响应.ok === true ? 'success' : 'fail', data: await 响应.text() } as 已审阅的any
    } catch (e) {
      console.error('GET 请求错误:\n路径: %o', 完整路径)
      return { status: 'unexpected', data: String(e) }
    }
  }

  public async 请求postJson<接口路径 extends 所有POST_JSON路径>(
    接口路径: 接口路径,
    参数: 取JSON输入<取接口<接口路径>>,
    请求选项或ws输出回调?: API请求选项 | ((data: 取ws输出<取接口<接口路径>>) => Promise<void>),
    ws连接回调?: (发送消息: (data: 取ws输入<取接口<接口路径>>) => void, ws: WebSocket) => Promise<void>,
    ws关闭回调?: (e: CloseEvent) => Promise<void>,
    ws错误回调?: (e: Event) => Promise<void>,
    附加请求选项?: API请求选项,
  ): Promise<
    取http错误输出<取接口<接口路径>> | 取http正确输出<取接口<接口路径>> | { status: 'unexpected'; data: string }
  > {
    let 请求选项 = typeof 请求选项或ws输出回调 === 'function' ? 附加请求选项 : 请求选项或ws输出回调
    let ws输出回调 = typeof 请求选项或ws输出回调 === 'function' ? 请求选项或ws输出回调 : undefined
    return (await this.通用请求(
      接口路径,
      { 'Content-Type': 'application/json' },
      'POST',
      JSON.stringify(参数),
      ws输出回调,
      ws连接回调,
      ws关闭回调,
      ws错误回调,
      请求选项,
    )) as 已审阅的any
  }
  public async 请求postJson并处理错误<接口路径 extends 所有POST_JSON路径>(
    接口路径: 接口路径,
    参数: 取JSON输入<取接口<接口路径>>,
    请求选项或ws输出回调?: API请求选项 | ((data: 取ws输出<取接口<接口路径>>) => Promise<void>),
    ws连接回调?: (发送消息: (data: 取ws输入<取接口<接口路径>>) => void, ws: WebSocket) => Promise<void>,
    ws关闭回调?: (e: CloseEvent) => Promise<void>,
    ws错误回调?: (e: Event) => Promise<void>,
    附加请求选项?: API请求选项,
  ): Promise<取http正确输出数据<取接口<接口路径>>> {
    return (await this.通用请求并处理错误(
      接口路径,
      async () =>
        (await this.请求postJson(
          接口路径,
          参数,
          请求选项或ws输出回调,
          ws连接回调,
          ws关闭回调,
          ws错误回调,
          附加请求选项,
        )) as 已审阅的any,
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
    let { 请求纯前端命令 } = await import('./pure-frontend-client')
    let result = await 请求纯前端命令({ command: 'reset-admin-password', password })
    if (是标准接口响应(result) === false || result.status !== 'success')
      throw new Error(是标准接口响应(result) ? String(result.data) : '重设管理员密码失败')
  }

  public async 重置纯前端数据库(): Promise<void> {
    if (环境变量.BUILD_TARGET !== 'pure-frontend') throw new Error('仅纯前端模式支持本机数据库重置')
    let { 请求纯前端命令 } = await import('./pure-frontend-client')
    let result = await 请求纯前端命令({ command: 'reset-database' })
    if (是标准接口响应(result) === false || result.status !== 'success')
      throw new Error(是标准接口响应(result) ? String(result.data) : '重置本机数据库失败')
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
    请求选项?: API请求选项,
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
                await ws输出回调(JSON对象模式.parse(JSON.parse(e.data)))
              },
            }
          : {}),
        ...(ws关闭回调 !== undefined ? { ws关闭回调: ws关闭回调 } : {}),
        ...(ws错误回调 !== undefined ? { ws错误回调: ws错误回调 } : {}),
        ...(ws连接回调 !== undefined || 请求选项?.信号 !== undefined
          ? {
              ws连接回调: async (ws: WebSocket): Promise<void> => {
                let 信号 = 请求选项?.信号
                if (信号 !== undefined) {
                  let 取消连接 = (): void => ws.close()
                  if (信号.aborted === true) {
                    取消连接()
                    return
                  }
                  信号.addEventListener('abort', 取消连接, { once: true })
                  ws.addEventListener('close', (): void => 信号.removeEventListener('abort', 取消连接), { once: true })
                }
                let 发送消息 = (data: 已审阅的any): void => {
                  ws.send(JSON.stringify(data))
                }
                await ws连接回调?.(发送消息, ws)
              },
            }
          : {}),
      }

      // console.log('请求:\n路径: %o\n头: %o\n方法: %o\nbody: %o\n结果: %o', 接口路径, 头, 方法, body, 请求结果)
      if (环境变量.BUILD_TARGET === 'pure-frontend') {
        let { 请求纯前端接口 } = await import('./pure-frontend-client')
        return await 等待可取消任务(请求纯前端接口(接口路径, 头, 方法, body), 请求选项?.信号)
      }
      请求结果 = await 等待可取消任务(
        web请求({
          url: API前缀 + 接口路径,
          body: body,
          headers: 头,
          method: 方法,
          ws路径: '/ws',
          wsId参数键: 'id',
          wsId头键: 'ws-client-id',
          ...ws回调选项,
        }),
        请求选项?.信号,
      )
      return 解析接口响应(JSON.parse(请求结果))
    } catch (e) {
      if (是中止错误(e, 请求选项?.信号) === true) throw e
      console.error(
        '请求错误:\n路径: %o\n头: %o\n方法: %o\n请求体: %o\n错误: %o',
        接口路径,
        脱敏请求头(头),
        方法,
        获得请求体摘要(body),
        获得错误摘要(e),
      )
      return { status: 'unexpected', data: String(e) }
    }
  }
  private async 通用请求并处理错误(
    接口路径: string,
    请求函数: () => Promise<object | { status: 'unexpected'; data: string }>,
  ): Promise<object> {
    let 请求结果 = await 请求函数()
    if (是标准接口响应(请求结果) === false) throw new Error(`接口响应格式错误: ${接口路径}`)

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
}

export let API管理器 = new API管理器类()
