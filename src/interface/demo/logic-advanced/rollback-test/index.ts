import {
  JSON参数解析插件,
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑JSON参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Left } from '@lsby/ts-fp-data'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { 环境变量 } from '../../../../global/env'
import { kysely插件 } from '../../../../global/plugin'

let 接口路径 = '/api/demo/logic-advanced/rollback-test' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑.空逻辑().绑定(
  接口逻辑.构造(
    [new JSON参数解析插件(z.object({ name: z.string(), pwd: z.string() }).strict(), {}), kysely插件],
    async (参数, 逻辑附加参数, 请求附加参数) => {
      let _log = 请求附加参数.log.extend(接口路径)

      return 参数.kysely.执行事务Either(async (trx) => {
        let userId = crypto.randomUUID()
        await trx
          .insertInto('user')
          .values({
            id: userId,
            name: 参数.json.name,
            pwd: await bcrypt.hash(参数.json.pwd, 环境变量.BCRYPT_ROUNDS),
            is_admin: 0,
          })
          .executeTakeFirst()
        await trx
          .insertInto('user_config')
          .values({ id: crypto.randomUUID(), user_id: userId, theme: '系统' })
          .executeTakeFirst()
        return new Left('就要失败' as const)
      })
    },
  ),
)

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['就要失败'])
let 接口正确类型描述 = z.object({}).strip()

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述))
