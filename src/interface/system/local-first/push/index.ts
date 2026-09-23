import {
  JSON参数解析插件,
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑JSON参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Either, Left, Right } from '@lsby/ts-fp-data'
import { z } from 'zod'
import { jwt插件, kysely插件 } from '../../../../global/plugin'
import { 写入同步数据库, 读取同步数据库 } from '../../../../interface-logic/local-first/project-sync'
import { 同步快照, 同步快照模式, 数据库快照模式, 计算数据库快照哈希 } from '../../../../model/local-first/sync-model'
import { 本地数据库Schema指纹 } from '../../../../types/local-first-database-meta'

let 接口路径 = '/api/system/local-first/push' as const
let 接口方法 = 'post' as const
type 同步错误 =
  | { code: 'NOT_LOGGED_IN'; message: string }
  | { code: 'SCHEMA_MISMATCH'; message: string }
  | { code: 'REMOTE_DATA_CHANGED'; message: string }
  | { code: 'INVALID_SYNC_DATABASE'; message: string }
let 输入模式 = z
  .object({
    schemaFingerprint: z.string().min(1),
    expectedDataHash: z.string().regex(/^[0-9a-f]{64}$/),
    database: 数据库快照模式,
  })
  .strict()

let 接口逻辑实现 = 接口逻辑.空逻辑().绑定(
  接口逻辑.构造(
    [new JSON参数解析插件(输入模式, {}), jwt插件.解析器, kysely插件],
    async (参数, _逻辑附加参数, 请求附加参数): Promise<Either<同步错误, 同步快照>> => {
      let _log = 请求附加参数.log.extend(接口路径)
      let 用户id = 参数.userId
      if (用户id === undefined) return new Left({ code: 'NOT_LOGGED_IN', message: '未登录' })
      if (参数.json.schemaFingerprint !== 本地数据库Schema指纹)
        return new Left({ code: 'SCHEMA_MISMATCH', message: '上传数据库的 Schema 与服务器不一致' })
      try {
        let 结果 = await 参数.kysely.执行事务(async (事务) => {
          let 当前数据库 = await 读取同步数据库(事务, 用户id)
          let 当前哈希 = await 计算数据库快照哈希(本地数据库Schema指纹, 当前数据库)
          if (当前哈希 !== 参数.json.expectedDataHash) return { 状态: '远程已变化' as const }
          await 写入同步数据库(事务, 用户id, 参数.json.database)
          let database = await 读取同步数据库(事务, 用户id)
          let dataHash = await 计算数据库快照哈希(本地数据库Schema指纹, database)
          return {
            状态: '成功' as const,
            快照: { schemaFingerprint: 本地数据库Schema指纹, dataHash, userId: 用户id, database },
          }
        })
        if (结果.状态 === '远程已变化')
          return new Left({ code: 'REMOTE_DATA_CHANGED', message: '同步期间远程数据已变化' })
        return new Right(结果.快照)
      } catch (错误) {
        return new Left({ code: 'INVALID_SYNC_DATABASE', message: 错误 instanceof Error ? 错误.message : String(错误) })
      }
    },
  ),
)

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.discriminatedUnion('code', [
  z.object({ code: z.literal('NOT_LOGGED_IN'), message: z.string() }).strict(),
  z.object({ code: z.literal('SCHEMA_MISMATCH'), message: z.string() }).strict(),
  z.object({ code: z.literal('REMOTE_DATA_CHANGED'), message: z.string() }).strict(),
  z.object({ code: z.literal('INVALID_SYNC_DATABASE'), message: z.string() }).strict(),
])

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 同步快照模式.strip()))
