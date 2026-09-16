import {
  JSON参数解析插件,
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑JSON参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Right } from '@lsby/ts-fp-data'
import { sql } from 'kysely'
import { z } from 'zod'
import { kysely插件 } from '../../../global/plugin'
import { init } from '../../../init/init'
import { 检查管理员登录 } from '../../../interface-logic/check/check-login-jwt-admin'

let 接口路径 = '/api/system/reset-database' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(检查管理员登录)
  .绑定(
    接口逻辑.构造([new JSON参数解析插件(z.object({}), {}), kysely插件], async (参数, 逻辑附加参数, 请求附加参数) => {
      let _log = 请求附加参数.log.extend(接口路径)

      await _log.warn('收到重置数据库请求，准备暴力清空所有表...')

      // 禁用外键约束
      await sql`PRAGMA foreign_keys = OFF`.execute(参数.kysely.获得句柄())

      // 获取所有业务表
      let tables = await sql<{
        name: string
      }>`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_migrations'`.execute(
        参数.kysely.获得句柄(),
      )

      // 清空表数据
      for (let table of tables.rows) {
        await _log.debug(`清空表: ${table.name}`)
        await 参数.kysely
          .获得句柄()
          .deleteFrom(table.name as any)
          .execute()
      }

      // 启用外键约束
      await sql`PRAGMA foreign_keys = ON`.execute(参数.kysely.获得句柄())

      await _log.warn('所有表数据已清空，准备重新执行初始化逻辑...')

      // 重新执行初始化脚本
      await init()

      await _log.warn('数据库重置及初始化完成！')

      return new Right({})
    }),
  )

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['未登录', '非管理员'])
let 接口正确类型描述 = z.object({})

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述))
