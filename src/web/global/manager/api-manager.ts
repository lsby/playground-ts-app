import { web请求 } from '@lsby/ts-http-extend'
import { z } from 'zod'
import { 项目标识 } from '../../../app/meta-info'
import { 环境变量 } from '../../../global/env'
import { 三方合并数据库, 同步快照, 同步快照模式, 数据库快照 } from '../../../model/local-first/sync-model'
import { 已审阅的any } from '../../../tools/types'
import { InterfaceType } from '../../../types/interface-type'
import { 本地数据库Schema指纹, 本地数据库主键表 } from '../../../types/local-first-database-meta'
import { 错误提示 } from '../manager/toast-manager'
import { 是中止错误, 等待可取消任务 } from '../tools/abort'
import { 脱敏请求头, 获得请求体摘要, 获得错误摘要 } from './api-log'
import { 是标准接口响应, 解析接口响应 } from './api-response'
import {
  停用本地优先状态,
  删除本地优先状态,
  本地优先同步失败处理器,
  本地优先同步问题解决器,
  获得接口浏览器支持,
  读取本地优先状态,
} from './local-first-state'
import {
  解决本地优先数据问题,
  读取本地优先同步数据库对,
  采用本地优先权威快照,
  验证本地优先数据库,
} from './local-first-sync'
import { 注册离线资源缓存 } from './offline-resource-manager'
import {
  使用纯前端数据库锁,
  添加本地优先上下文,
  终止纯前端Worker,
  请求纯前端Worker响应,
  请求纯前端命令,
  请求纯前端接口,
} from './pure-frontend-client'
export type {
  同步数据库副本,
  本地优先同步失败处理器,
  本地优先同步解决方案,
  本地优先同步问题,
  本地优先同步问题解决器,
  本地优先迁移失败项,
} from './local-first-state'

export type API请求选项 = { 信号?: AbortSignal }

let 正在执行本地优先同步 = false

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
let API前缀 = ''
let 离线资源准备任务 = 注册离线资源缓存()
if (离线资源准备任务 !== undefined) {
  void 离线资源准备任务.catch((错误: unknown) => {
    console.error('离线资源缓存初始化失败，在线功能不受影响: %o', 获得错误摘要(错误))
  })
}

export class API管理器类 {
  private 本地存储名称 = `${项目标识}-api-token`
  private token: string | null = null
  private 本地优先同步任务: Promise<void> | undefined

  public constructor() {
    let storedToken = localStorage.getItem(this.本地存储名称)
    if (storedToken !== null) this.token = storedToken
  }

  public 设置token(token: string): Promise<void> {
    this.token = token
    localStorage.setItem(this.本地存储名称, token)
    if (环境变量.BUILD_TARGET !== 'pure-frontend') 停用本地优先状态()
    return Promise.resolve()
  }
  public 清除token(): Promise<void> {
    this.token = null
    localStorage.removeItem(this.本地存储名称)
    停用本地优先状态()
    return Promise.resolve()
  }

  public 已设置token(): boolean {
    return this.token !== null
  }

  public async 本地优先同步(问题解决器: 本地优先同步问题解决器, 失败处理器: 本地优先同步失败处理器): Promise<void> {
    if (环境变量.BUILD_TARGET === 'pure-frontend') return
    let 同步任务 = this.本地优先同步任务
    if (同步任务 === undefined) {
      同步任务 = this.执行本地优先同步(问题解决器)
      this.本地优先同步任务 = 同步任务
      void 同步任务
        .finally((): void => {
          if (this.本地优先同步任务 === 同步任务) this.本地优先同步任务 = undefined
        })
        .catch((): void => {})
    }
    try {
      await 同步任务
    } catch (错误) {
      await 失败处理器(错误)
      throw 错误
    }
  }

  private async 执行本地优先同步(问题解决器: 本地优先同步问题解决器): Promise<void> {
    if (this.token === null) throw new Error('本地优先同步需要先登录')
    正在执行本地优先同步 = true
    try {
      await 使用纯前端数据库锁(async (): Promise<void> => {
        for (let 尝试次数 = 0; 尝试次数 < 3; 尝试次数 += 1) {
          let 远程快照 = await this.拉取本地优先快照()
          if (远程快照.schemaFingerprint !== 本地数据库Schema指纹) {
            停用本地优先状态()
            终止纯前端Worker()
            throw new Error('服务器 Schema 与当前前端版本不一致，请先更新应用资源')
          }
          let 已有状态 = 读取本地优先状态(远程快照.userId)
          if (已有状态 === undefined) {
            await 采用本地优先权威快照(远程快照)
            return
          }

          let 数据库对 = await 读取本地优先同步数据库对(已有状态, Object.keys(远程快照.database))
          if (数据库对.状态 === '迁移失败') {
            let 解决方案 = await 问题解决器({
              type: 'migration-failed',
              userId: 远程快照.userId,
              targetSchemaFingerprint: 远程快照.schemaFingerprint,
              failures: 数据库对.failures,
            })
            switch (解决方案.action) {
              case 'discard-and-reinitialize':
                删除本地优先状态(远程快照.userId)
                终止纯前端Worker()
                await 采用本地优先权威快照(远程快照, true)
                return
              case 'abort':
                throw new Error('本地数据库迁移失败，已取消同步')
              case 'use-database':
                throw new Error('迁移失败时不允许修复或提交本地数据库')
            }
          }
          if (
            远程快照.schemaFingerprint !== 数据库对.基线Schema指纹 ||
            远程快照.schemaFingerprint !== 数据库对.当前Schema指纹
          )
            throw new Error('本地数据库完成迁移后与服务器 Schema 仍不一致')
          let 最终数据库: 数据库快照
          let 合并结果 = 三方合并数据库(远程快照.database, 数据库对.基线数据库, 数据库对.当前数据库, 本地数据库主键表)
          if (合并结果.状态 === '成功') 最终数据库 = 合并结果.数据库
          else
            最终数据库 = await 解决本地优先数据问题(问题解决器, {
              type: 'data-conflict',
              conflicts: 合并结果.冲突列表,
              remoteDatabase: { schemaFingerprint: 远程快照.schemaFingerprint, database: 远程快照.database },
              baselineDatabase: { schemaFingerprint: 数据库对.基线Schema指纹, database: 数据库对.基线数据库 },
              localDatabase: { schemaFingerprint: 数据库对.当前Schema指纹, database: 数据库对.当前数据库 },
              targetSchemaFingerprint: 远程快照.schemaFingerprint,
            })

          try {
            await 验证本地优先数据库(最终数据库)
          } catch (错误) {
            最终数据库 = await 解决本地优先数据问题(问题解决器, {
              type: 'constraint-violation',
              detail: 错误 instanceof Error ? 错误.message : String(错误),
              remoteDatabase: { schemaFingerprint: 远程快照.schemaFingerprint, database: 远程快照.database },
              baselineDatabase: { schemaFingerprint: 数据库对.基线Schema指纹, database: 数据库对.基线数据库 },
              localDatabase: { schemaFingerprint: 数据库对.当前Schema指纹, database: 数据库对.当前数据库 },
              targetSchemaFingerprint: 远程快照.schemaFingerprint,
            })
            await 验证本地优先数据库(最终数据库)
          }

          let 提交结果 = await this.提交本地优先快照(远程快照, 最终数据库)
          if (提交结果 === 'REMOTE_DATA_CHANGED') continue
          await 采用本地优先权威快照(提交结果)
          return
        }
        throw new Error('远程数据在同步期间持续变化，请稍后重试')
      })
    } finally {
      正在执行本地优先同步 = false
    }
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
      let 浏览器支持 = 获得接口浏览器支持(完整路径, 'GET')
      if (环境变量.BUILD_TARGET === 'pure-frontend' || (浏览器支持 === '本地优先' && this.token !== null)) {
        await this.确保本地优先已初始化()
        if (正在执行本地优先同步 === true) throw new Error('同步期间不能调用本地优先接口')
        let 响应 = await 使用纯前端数据库锁(() =>
          请求纯前端Worker响应(添加本地优先上下文({ path: 完整路径, headers: 头, method: 'GET', body: '' })),
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

  private async 确保本地优先已初始化(): Promise<void> {
    if (环境变量.BUILD_TARGET === 'pure-frontend') return
    let 同步任务 = this.本地优先同步任务
    if (同步任务 !== undefined) await 同步任务
    if (读取本地优先状态() === undefined)
      throw new Error('本地优先数据库尚未初始化，请先显式调用 API管理器.本地优先同步')
  }

  private async 请求远程同步接口(路径: string, 参数: object): Promise<{ status: string; data: unknown }> {
    let 头: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.token !== null) 头['authorization'] = `Bearer ${this.token}`
    let 请求结果 = await web请求({ url: API前缀 + 路径, body: JSON.stringify(参数), headers: 头, method: 'POST' })
    return 解析接口响应(JSON.parse(请求结果))
  }

  private async 拉取本地优先快照(): Promise<同步快照> {
    let 结果 = await this.请求远程同步接口('/api/system/local-first/pull', {})
    if (结果.status !== 'success') throw new Error(`后到前同步失败: ${JSON.stringify(结果.data)}`)
    return 同步快照模式.parse(结果.data)
  }

  private async 提交本地优先快照(远程快照: 同步快照, 数据库: 数据库快照): Promise<同步快照 | 'REMOTE_DATA_CHANGED'> {
    let 结果 = await this.请求远程同步接口('/api/system/local-first/push', {
      schemaFingerprint: 远程快照.schemaFingerprint,
      expectedDataHash: 远程快照.dataHash,
      database: 数据库,
    })
    if (结果.status === 'success') return 同步快照模式.parse(结果.data)
    let 错误代码 = z.object({ code: z.string(), message: z.string() }).strict().safeParse(结果.data)
    if (错误代码.success === true && 错误代码.data.code === 'REMOTE_DATA_CHANGED') return 'REMOTE_DATA_CHANGED'
    throw new Error(`前到后同步失败: ${JSON.stringify(结果.data)}`)
  }

  public async 重置纯前端管理员密码(password: string): Promise<void> {
    if (环境变量.BUILD_TARGET !== 'pure-frontend') throw new Error('仅纯前端模式支持本机管理员密码重设')
    let result = await 请求纯前端命令({ command: 'reset-admin-password', password })
    if (是标准接口响应(result) === false || result.status !== 'success')
      throw new Error(是标准接口响应(result) ? String(result.data) : '重设管理员密码失败')
  }

  public async 重置纯前端数据库(): Promise<void> {
    if (环境变量.BUILD_TARGET !== 'pure-frontend') throw new Error('仅纯前端模式支持本机数据库重置')
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
                await ws输出回调(JSON.parse(e.data))
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
      let 浏览器支持 = 获得接口浏览器支持(接口路径, 方法)
      if (环境变量.BUILD_TARGET === 'pure-frontend' || (浏览器支持 === '本地优先' && this.token !== null)) {
        await this.确保本地优先已初始化()
        if (正在执行本地优先同步 === true) throw new Error('同步期间不能调用本地优先接口')
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
