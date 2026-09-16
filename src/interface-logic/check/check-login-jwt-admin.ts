import { 接口逻辑 } from '@lsby/net-core'
import { Left, Right } from '@lsby/ts-fp-data'
import { jwt插件, kysely插件 } from '../../global/plugin'

export let 检查管理员登录 = 接口逻辑.构造([jwt插件.解析器, kysely插件], async (参数, _逻辑附加参数, 请求附加参数) => {
  let _log = 请求附加参数.log.extend('检查管理员登录')

  let userId = 参数.userId
  if (userId === undefined) return new Left('未登录' as const)

  let 用户 = await 参数.kysely
    .获得句柄()
    .selectFrom('user')
    .select(['id', 'is_admin'])
    .where('id', '=', userId)
    .executeTakeFirst()
  if (用户 === undefined) return new Left('未登录' as const)
  if (用户.is_admin !== 1) return new Left('非管理员' as const)

  return new Right({ userId })
})
