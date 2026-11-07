import { JWT异步插件 } from '@lsby/net-core-jwt'
import { Kysely插件 } from '@lsby/net-core-kysely'
import { Task } from '@lsby/ts-fp-data'
import { z } from 'zod'
import { 项目标识 } from '../../app/meta-info'
import { 获得环境变量 } from '../../global/env'
import { 全局资源 } from '../../global/global'

let 用户模式 = z.object({ userId: z.string().or(z.undefined()) }).strict()
let 纯前端JWT: JWT异步插件<typeof 用户模式> | null = null
function 获得纯前端JWT(): JWT异步插件<typeof 用户模式> {
  if (纯前端JWT === null) {
    纯前端JWT = new JWT异步插件(用户模式, `${项目标识}-pure-frontend-local-token`, 获得环境变量().JWT_EXPIRES_IN)
  }
  return 纯前端JWT
}
export let kysely插件 = new Kysely插件('kysely', () => 全局资源.获得数据库())
export let jwt插件 = {
  解析器: new Task(async () => 获得纯前端JWT().异步解析器),
  签名器: new Task(async () => 获得纯前端JWT().异步签名器),
}
