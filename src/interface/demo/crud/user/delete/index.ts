import { 常用接口返回器, 接口, 接口逻辑 } from '@lsby/net-core'
import { Kysely管理器 } from '@lsby/ts-kysely'
import { z } from 'zod'
import { jwt插件, kysely插件 } from '../../../../../global/plugin'
import { 检查JSON参数 } from '../../../../../interface-logic/check/check-json-args'
import { 检查管理员登录 } from '../../../../../interface-logic/check/check-login-jwt-admin'
import { 删除逻辑 } from '../../../../../interface-logic/components/crud/delete'

let 接口路径 = '/api/demo/crud/user/delete' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(new 检查管理员登录([jwt插件.解析器, kysely插件], () => ({ 表名: 'user', id字段: 'id', 标识字段: 'is_admin' })))
  .绑定(new 检查JSON参数(z.object({ id: z.string() })))
  .绑定(
    接口逻辑.构造([kysely插件], async (参数, 逻辑附加参数, 请求附加参数) => {
      let log = 请求附加参数.log.extend(删除逻辑.name)

      return 参数.kysely.执行事务Either(async (trx) => {
        return 接口逻辑
          .空逻辑()
          .绑定(new 删除逻辑(kysely插件, 'user_config', async () => ({ 条件们: [['user_id', '=', 逻辑附加参数.id]] })))
          .绑定(new 删除逻辑(kysely插件, 'user', async () => ({ 条件们: [['id', '=', 逻辑附加参数.id]] })))
          .调用({ kysely: Kysely管理器.从句柄创建(trx) }, {}, { ...请求附加参数, log })
      })
    }),
  )

let 接口错误类型描述 = z.enum(['验证JSON参数失败', '未登录', '非管理员'])
let 接口正确类型描述 = z.object({})

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述), {
  支持纯前端模式: true,
})
