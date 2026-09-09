import { 接口逻辑测试, 默认请求附加参数 } from '@lsby/net-core'
import assert from 'assert'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { cleanDB } from '../../../../scripts/db/clean-db'
import { 环境变量 } from '../../../global/env'
import { kysely管理器, 系统配置ID } from '../../../global/global'
import { jwt插件 } from '../../../global/plugin'
import { 已审阅的any } from '../../../tools/types'
import 接口 from './index'

let name = 'admin'
let pwd = '123456'

export default new 接口逻辑测试(
  async (): Promise<void> => {
    let db = kysely管理器.获得句柄()
    await cleanDB(db)
    await db
      .insertInto('system_config')
      .values({ id: 系统配置ID, is_initialized: 1, enable_register: 0, version: '', jwt_secret: '123' })
      .execute()
    await db
      .insertInto('user')
      .values({ id: randomUUID(), name: name, pwd: await bcrypt.hash(pwd, 环境变量.BCRYPT_ROUNDS), is_admin: 0 })
      .execute()
  },
  async (): Promise<void> => {
    let jwt签名插件 = await jwt插件.签名器.run()
    let 签名结果 = await jwt签名插件.运行({} as 已审阅的any, {} as 已审阅的any, 默认请求附加参数)
    let { signJwt } = 签名结果.assertRight().getRight()

    let 结果 = await 接口
      .获得接口逻辑()
      .调用(
        { kysely: kysely管理器, json: { userName: name, userPassword: pwd }, signJwt: signJwt },
        {},
        默认请求附加参数,
      )
    assert.strictEqual(结果.isRight(), true)
    assert.strictEqual(typeof 结果.assertRight().getRight().token === 'string', true)
    assert.strictEqual(结果.assertRight().getRight().token.length > 0, true)
  },
)
