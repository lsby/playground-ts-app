import { 插件 } from '@lsby/net-core'
import { JWT异步插件 } from '@lsby/net-core-jwt'
import { Kysely插件 } from '@lsby/net-core-kysely'
import { Right, Task } from '@lsby/ts-fp-data'
import { z } from 'zod'
import { 项目标识 } from '../../app/meta-info'
import { 环境变量 } from '../../global/env'
import { kysely管理器 } from '../../global/global'

let 用户模式 = z.object({ userId: z.string().or(z.undefined()) }).strict()
let 纯前端JWT = new JWT异步插件(用户模式, `${项目标识}-pure-frontend-local-token`, 环境变量.JWT_EXPIRES_IN)
let 本地优先解析器 = new 插件(z.never(), 用户模式, async (req) => {
  let 用户id = req.headers['x-local-first-user-id']
  return new Right({ userId: typeof 用户id === 'string' && 用户id !== '' ? 用户id : undefined })
})
let 本地优先签名器 = 纯前端JWT.异步签名器

export let kysely插件 = new Kysely插件('kysely', kysely管理器)
export let jwt插件 = {
  解析器: new Task(async () => (环境变量.BUILD_TARGET === 'pure-frontend' ? 纯前端JWT.异步解析器 : 本地优先解析器)),
  签名器: new Task(async () => (环境变量.BUILD_TARGET === 'pure-frontend' ? 纯前端JWT.异步签名器 : 本地优先签名器)),
}
