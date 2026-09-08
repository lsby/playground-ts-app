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
import { z } from 'zod'
import { jwt插件, kysely插件 } from '../../../../global/plugin'

let 接口路径 = '/api/demo/auth/is-login' as const
let 接口方法 = 'post' as const
let 接口逻辑实现 = 接口逻辑.空逻辑().绑定(
  接口逻辑.构造([new JSON参数解析插件(z.object({}), {}), jwt插件.解析器, kysely插件], async (参数) => {
    if (参数.userId === undefined) return new Right({ isLogin: false })
    let 用户 = await 参数.kysely
      .获得句柄()
      .selectFrom('user')
      .select('id')
      .where('id', '=', 参数.userId)
      .executeTakeFirst()
    return new Right({ isLogin: 用户 !== undefined })
  }),
)

type _JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

export default new 接口(
  接口路径,
  接口方法,
  接口逻辑实现,
  new 常用接口返回器(z.never(), z.object({ isLogin: z.boolean() })),
  { 支持纯前端模式: true },
)
