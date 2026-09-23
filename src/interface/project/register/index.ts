import {
  JSON参数解析插件,
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
import { 验证密码, 验证用户名 } from '../../../model/user/user-validation'

let 接口路径 = '/api/project/register' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑.空逻辑().绑定(
  接口逻辑.构造(
    [new JSON参数解析插件(z.object({ userName: z.string(), userPassword: z.string() }), {}), kysely插件],
    async (参数, _逻辑附加参数, 请求附加参数) => {
      let _log = 请求附加参数.log.extend(接口路径)
      let 注册参数 = 参数.json
      let 数据库 = 参数.kysely.获得句柄()

      let 配置 = await 数据库
        .selectFrom('system_config')
        .select('enable_register')
        .where('id', '=', 系统配置ID)
        .executeTakeFirst()
      if (配置 === undefined) throw new Error('系统配置不存在')
      if (配置.enable_register !== 1) return new Left('注册未启用' as const)

      let 用户名错误 = 验证用户名(注册参数.userName)
      if (用户名错误 !== undefined) return new Left(用户名错误)

      let 密码错误 = 验证密码(注册参数.userPassword)
      if (密码错误 !== undefined) return new Left(密码错误)

      let 已有用户 = await 数据库
        .selectFrom('user')
        .select('id')
        .where('name', '=', 注册参数.userName)
        .executeTakeFirst()
      if (已有用户 !== undefined) return new Left('用户名已存在' as const)

      return 参数.kysely.执行事务Either(async (事务) => {
        let 用户ID = randomUUID()
        await 事务
          .insertInto('user')
          .values({
            id: 用户ID,
            name: 注册参数.userName,
            pwd: await bcrypt.hash(注册参数.userPassword, 环境变量.BCRYPT_ROUNDS),
            is_admin: 0,
          })
          .execute()
        await 事务.insertInto('user_config').values({ id: randomUUID(), user_id: 用户ID, theme: '系统' }).execute()
        return new Right({})
      })
    },
  ),
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
])
let 接口正确类型描述 = z.object({})

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述), {
  浏览器支持: '纯前端',
})
