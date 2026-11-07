import { JWT异步插件 } from '@lsby/net-core-jwt'
import { Kysely管理器 } from '@lsby/ts-kysely'
import { Log } from '@lsby/ts-log'
import { z } from 'zod'
import { 即时任务管理器类 } from '../model/job-instant/instant-job-manager'
import { 定时任务管理器类 } from '../model/job-scheduled/scheduled-job-manager'
import { 日志模型 } from '../model/log/log-model'
import type { DB } from '../types/db'
import { 系统配置ID } from './const'
import { 创建sqlite数据库适配器 } from './db/db-dialect'
import { 获得环境变量 } from './env'

export { 系统配置ID } from './const'

let JWT用户模式 = z.object({ userId: z.string().or(z.undefined()) }).passthrough()
type JWT插件类型 = JWT异步插件<z.ZodObject<{ userId: z.ZodUnion<[z.ZodString, z.ZodUndefined]> }>>

/**
 * 全局资源集代表当前应用共享的资源及其存续期间。
 * 它按需保存数据库、日志、任务管理器和身份凭证能力，协调这些资源的依赖与关闭顺序。
 * 获取资源会复用已有实例，关闭时等待任务结束并释放已经创建的数据库。
 */
export class 全局资源集 {
  private 数据库: Kysely管理器<DB> | null = null
  private 日志: Log | null = null
  private 日志数据: 日志模型 | null = null
  private 即时任务: 即时任务管理器类 | null = null
  private 定时任务: 定时任务管理器类 | null = null
  private JWT插件Promise: Promise<JWT插件类型> | null = null
  private 状态: '开放' | '关闭中' | '已关闭' = '开放'
  private 关闭Promise: Promise<void> | null = null

  private 确认可获取(已创建: boolean): void {
    if (this.状态 === '已关闭') throw new Error('全局资源已关闭')
    if (this.状态 === '关闭中' && 已创建 === false) throw new Error('全局资源关闭期间不能创建新资源')
  }

  public 获得数据库(): Kysely管理器<DB> {
    this.确认可获取(this.数据库 !== null)
    if (this.数据库 === null) {
      let 配置 = 获得环境变量()
      let 适配器 = 创建sqlite数据库适配器(配置.DB_PATH)
      try {
        this.数据库 = Kysely管理器.从适配器创建<DB>(
          适配器,
          配置.NODE_ENV === 'development' ? ['query', 'error'] : [],
          undefined,
          (): void => 适配器.关闭(),
        )
      } catch (错误) {
        try {
          适配器.关闭()
        } catch (清理错误) {
          throw new AggregateError([错误, 清理错误], '创建数据库管理器失败，且适配器清理失败')
        }
        throw 错误
      }
    }
    return this.数据库
  }

  public 获得日志模型(): 日志模型 {
    this.确认可获取(this.日志数据 !== null)
    if (this.日志数据 === null) this.日志数据 = new 日志模型()
    return this.日志数据
  }

  public 获得日志(): Log {
    this.确认可获取(this.日志 !== null)
    if (this.日志 === null) {
      let 日志数据 = this.获得日志模型()
      this.日志 = new Log(获得环境变量().DEBUG_NAME).pipe(async (级别, 名称空间, 内容): Promise<void> => {
        if (内容.includes('WebSocket 未打开，无法发送消息')) return // 避免无限循环
        await 日志数据.记录日志(`[${级别}] [${名称空间}] ${内容}`)
      })
    }
    return this.日志
  }

  public 获得即时任务管理器(): 即时任务管理器类 {
    this.确认可获取(this.即时任务 !== null)
    if (this.即时任务 === null) {
      this.即时任务 = new 即时任务管理器类({
        最大并发数: 10,
        历史记录保留天数: 7,
        日志: this.获得日志().extend('即时任务管理器'),
      })
    }
    return this.即时任务
  }

  public 获得定时任务管理器(): 定时任务管理器类 {
    this.确认可获取(this.定时任务 !== null)
    if (this.定时任务 === null) this.定时任务 = new 定时任务管理器类()
    return this.定时任务
  }

  public 获得JWT插件(): Promise<JWT插件类型> {
    this.确认可获取(this.JWT插件Promise !== null)
    if (this.JWT插件Promise === null) this.JWT插件Promise = this.创建JWT插件()
    return this.JWT插件Promise
  }

  private async 创建JWT插件(): Promise<JWT插件类型> {
    let 数据库 = this.获得数据库()
    let 系统数据 = await 数据库
      .获得句柄()
      .selectFrom('system_config')
      .selectAll()
      .where('id', '=', 系统配置ID)
      .executeTakeFirst()
    let jwt密钥 = 系统数据?.jwt_secret
    if (jwt密钥 === undefined) throw new Error('无法加载jwt密钥')
    return new JWT异步插件(JWT用户模式, jwt密钥, 获得环境变量().JWT_EXPIRES_IN)
  }

  public 关闭(): Promise<void> {
    if (this.关闭Promise === null) {
      this.状态 = '关闭中'
      this.关闭Promise = this.执行关闭().finally((): void => {
        this.状态 = '已关闭'
      })
    }
    return this.关闭Promise
  }

  private async 执行关闭(): Promise<void> {
    let 错误组: unknown[] = []
    let 任务关闭们: Promise<void>[] = []
    if (this.定时任务 !== null) 任务关闭们.push(this.定时任务.关闭())
    if (this.即时任务 !== null) 任务关闭们.push(this.即时任务.关闭())
    for (let 结果 of await Promise.allSettled(任务关闭们)) {
      if (结果.status === 'rejected') 错误组.push(结果.reason)
    }
    if (this.JWT插件Promise !== null) {
      // 初始化失败由获得 JWT 的调用方处理；关闭仍须等待初始化停止使用数据库。
      await this.JWT插件Promise.then(
        (): void => {},
        (): void => {},
      )
    }
    if (this.数据库 !== null) {
      try {
        await this.数据库.销毁()
      } catch (错误) {
        错误组.push(错误)
      }
    }
    if (错误组.length > 0) throw new AggregateError(错误组, '关闭全局资源时有资源回收失败')
  }
}

export let 全局资源 = new 全局资源集()

export let syncLogCallBack = async (level: string, namespace: string, content: string): Promise<void> => {
  if (content.includes('WebSocket 未打开，无法发送消息')) return // 避免无限循环
  await 全局资源.获得日志模型().记录日志(`[${level}] [${namespace}] ${content}`)
}

export async function 检查数据库是否可用(): Promise<void> {
  try {
    await 全局资源.获得数据库().获得句柄().selectFrom('system_config').select('id').limit(1).execute()
  } catch (错误: unknown) {
    let 错误消息 = ''
    if (错误 instanceof Error) {
      错误消息 = 错误.message
    } else {
      错误消息 = String(错误)
    }
    let 友好错误 = new Error(
      `数据库未就绪或未完成初始化！\n` +
        `这通常是因为您还没有运行数据库同步/推送命令（例如："npm run task -- db:push:dev:web"）。\n` +
        `请先执行相应的推送命令来新建数据库和表结构。\n` +
        `底层错误详情: ${错误消息}`,
    )
    throw 友好错误
  }
}
