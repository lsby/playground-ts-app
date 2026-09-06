import {
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑JSON参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Left, Right } from '@lsby/ts-fp-data'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { 系统配置ID } from '../../../global/const'
import { 环境变量 } from '../../../global/env'
import { kysely插件 } from '../../../global/plugin'
import { 检查唯一性 } from '../../../interface-logic/check/check-exist'
import { 检查用户名 } from '../../../interface-logic/check/check-user-name'
import { 检查密码 } from '../../../interface-logic/check/check-user-pwd'

let 接口路径 = '/api/project/register' as const
let 接口方法 = 'post' as const

let 用户表 = z.object({ id: z.string(), name: z.string(), pwd: z.string() })

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(
    接口逻辑.构造([kysely插件], async (参数, _逻辑附加参数, _请求附加参数) => {
      let 配置 = await 参数.kysely
        .获得句柄()
        .selectFrom('system_config')
        .select('enable_register')
        .where('id', '=', 系统配置ID)
        .executeTakeFirst()
      if ((配置?.enable_register ?? 0) !== 1) {
        return new Left('注册未启用' as const)
      }
      return new Right({})
    }),
  )
  .绑定(new 检查用户名('userName'))
  .绑定(new 检查密码('userPassword'))
  .绑定(
    new 检查唯一性({
      表名: 'user',
      表结构zod: 用户表,
      数据库字段名: 'name',
      参数字段名: 'userName',
      错误信息: '用户名已存在' as const,
      kysely插件: kysely插件,
    }),
  )
  .绑定(
    接口逻辑.构造([kysely插件], async (参数, 逻辑附加参数, _请求附加参数) => {
      return 参数.kysely.执行事务Either(async (trx) => {
        let userId = randomUUID()
        await trx
          .insertInto('user')
          .values({
            id: userId,
            name: 逻辑附加参数.userName,
            pwd: await bcrypt.hash(逻辑附加参数.userPassword, 环境变量.BCRYPT_ROUNDS),
            is_admin: 0,
          })
          .execute()
        await trx.insertInto('user_config').values({ id: randomUUID(), user_id: userId, theme: '系统' }).execute()
        return new Right({})
      })
    }),
  )

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum([
  '用户名已存在',
  '用户名不能包含空格',
  '用户名不能为空',
  '用户名过短',
  '用户名过长',
  '密码不能包含空格',
  '密码不能为空',
  '密码过短',
  '密码过长',
  '注册未启用',
  '缺少必要参数',
])
let 接口正确类型描述 = z.object({})

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述), {
  支持纯前端模式: true,
})
