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
import { z } from 'zod'
import { 环境变量 } from '../../../global/env'
import { jwt插件, kysely插件 } from '../../../global/plugin'

let 接口路径 = '/api/project/local-login' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑.空逻辑().绑定(
  接口逻辑.构造(
    [new JSON参数解析插件(z.object({}).strict(), {}), jwt插件.签名器, kysely插件],
    async (参数, 逻辑附加参数, 请求附加参数) => {
      let _log = 请求附加参数.log.extend(接口路径)

      if (环境变量.LOCAL_MODE !== true) {
        return new Left('未开启本地模式' as const)
      }

      let 默认用户 = await 参数.kysely
        .获得句柄()
        .selectFrom('user')
        .select(['id'])
        .where('name', '=', 环境变量.DEFAULT_SYSTEM_USER)
        .executeTakeFirst()

      if (默认用户 === undefined) return new Left('默认系统用户不存在' as const)

      return new Right({ token: await 参数.signJwt({ userId: 默认用户.id }) })
    },
  ),
)

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['未开启本地模式', '默认系统用户不存在'])
let 接口正确类型描述 = z.object({ token: z.string() }).strip()

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述), {
  浏览器支持: '纯前端',
})
