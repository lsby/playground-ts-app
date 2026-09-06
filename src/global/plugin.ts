import { JWT异步插件 } from '@lsby/net-core-jwt'
import { Kysely插件 } from '@lsby/net-core-kysely'
import { Task } from '@lsby/ts-fp-data'
import { z, ZodObject, ZodString, ZodUndefined, ZodUnion } from 'zod'
import { 系统配置ID } from './const'
import { 环境变量 } from './env'
import { kysely管理器 } from './global'

class JWT单例 {
  private static jwt句柄: JWT异步插件<ZodObject<{ userId: ZodUnion<[ZodString, ZodUndefined]> }>> | null = null
  public static async 获得jwt句柄(): Promise<
    JWT异步插件<z.ZodObject<{ userId: ZodUnion<[ZodString, ZodUndefined]> }>>
  > {
    if (this.jwt句柄 !== null) return this.jwt句柄
    let 系统数据 = await kysely管理器
      .获得句柄()
      .selectFrom('system_config')
      .selectAll()
      .where('id', '=', 系统配置ID)
      .executeTakeFirst()
    let jwt密钥 = 系统数据?.jwt_secret
    if (jwt密钥 === undefined) throw new Error('无法加载jwt密钥')
    this.jwt句柄 = new JWT异步插件(z.object({ userId: z.string().or(z.undefined()) }), jwt密钥, 环境变量.JWT_EXPIRES_IN)
    return this.jwt句柄
  }
}

export let kysely插件 = new Kysely插件('kysely', kysely管理器)
export let jwt插件 = {
  解析器: new Task(async () => {
    return (await JWT单例.获得jwt句柄()).异步解析器
  }),
  签名器: new Task(async () => {
    return (await JWT单例.获得jwt句柄()).异步签名器
  }),
}
