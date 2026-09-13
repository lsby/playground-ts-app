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
import { jwt插件, kysely插件 } from '../../../global/plugin'
import { 检查登录 } from '../../../interface-logic/check/check-login-jwt'

let 接口路径 = '/api/user/get-user-config' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(new 检查登录([jwt插件.解析器, kysely插件], () => ({ 表名: 'user', id字段: 'id' })))
  .绑定(
    接口逻辑.构造([new JSON参数解析插件(z.object({}), {}), kysely插件], async (参数, 逻辑附加参数, 请求附加参数) => {
      let _log = 请求附加参数.log.extend(接口路径)

      let 配置 = await 参数.kysely
        .获得句柄()
        .selectFrom('user_config')
        .selectAll()
        .where('user_id', '=', 逻辑附加参数.userId)
        .executeTakeFirst()

      if (配置 === undefined) return new Left('用户配置不存在' as const)

      let 主题 = z.enum(['系统', '亮色', '暗色']).parse(配置.theme)
      return new Right({ id: 配置.id, theme: 主题 })
    }),
  )

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['未登录', '用户配置不存在'])
let 接口正确类型描述 = z.object({ id: z.string(), theme: z.enum(['系统', '亮色', '暗色']) })

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述), {
  支持纯前端模式: true,
})
