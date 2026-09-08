import {
  JSON参数解析插件,
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑JSON参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Kysely管理器 } from '@lsby/ts-kysely'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { 环境变量 } from '../../../../../global/env'
import { jwt插件, kysely插件 } from '../../../../../global/plugin'
import { 检查管理员登录 } from '../../../../../interface-logic/check/check-login-jwt-admin'
import { 新增逻辑 } from '../../../../../interface-logic/components/crud/create'

let 接口路径 = '/api/demo/crud/user/create' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(new 检查管理员登录([jwt插件.解析器, kysely插件], () => ({ 表名: 'user', id字段: 'id', 标识字段: 'is_admin' })))
  .绑定(
    接口逻辑.构造(
      [new JSON参数解析插件(z.object({ name: z.string(), pwd: z.string() }), {}), kysely插件],
      async (参数, 逻辑附加参数, 请求附加参数) => {
        let log = 请求附加参数.log
        return 参数.kysely.执行事务Either(async (trx) => {
          let userId = crypto.randomUUID()
          return 接口逻辑
            .空逻辑()
            .绑定(
              new 新增逻辑(
                kysely插件,
                'user',
                async () => ({
                  数据: {
                    id: userId,
                    name: 参数.json.name,
                    pwd: await bcrypt.hash(参数.json.pwd, 环境变量.BCRYPT_ROUNDS),
                    is_admin: 0,
                  },
                }),
                async () => ({}),
              ),
            )
            .绑定(
              new 新增逻辑(
                kysely插件,
                'user_config',
                async () => ({ 数据: { id: crypto.randomUUID(), user_id: userId, theme: '系统' } }),
                async () => ({}),
              ),
            )
            .调用({ kysely: Kysely管理器.从句柄创建(trx) }, {}, { ...请求附加参数, log })
        })
      },
    ),
  )

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['未登录', '非管理员'])
let 接口正确类型描述 = z.object({})

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述), {
  支持纯前端模式: true,
})
