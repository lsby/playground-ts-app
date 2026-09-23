import { JSON参数解析插件, 常用接口返回器, 接口, 接口逻辑 } from '@lsby/net-core'
import { Right } from '@lsby/ts-fp-data'
import { z } from 'zod'
import { kysely插件 } from '../../../../../global/plugin'
import { 检查管理员登录 } from '../../../../../interface-logic/check/check-login-jwt-admin'

let 接口路径 = '/api/demo/crud/user/delete' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(检查管理员登录)
  .绑定(
    接口逻辑.构造(
      [new JSON参数解析插件(z.object({ id: z.string() }).strict(), {}), kysely插件],
      async (参数, _逻辑附加参数, 请求附加参数) => {
        let _log = 请求附加参数.log.extend(接口路径)
        return 参数.kysely.执行事务Either(async (trx) => {
          await trx.deleteFrom('user_config').where('user_id', '=', 参数.json.id).executeTakeFirst()
          await trx.deleteFrom('user').where('id', '=', 参数.json.id).executeTakeFirst()
          return new Right({})
        })
      },
    ),
  )

let 接口错误类型描述 = z.enum(['未登录', '非管理员'])
let 接口正确类型描述 = z.object({}).strip()

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述), {
  浏览器支持: '纯前端',
})
