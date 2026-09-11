import { 接口逻辑测试, 默认请求附加参数 } from '@lsby/net-core'
import assert from 'assert'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { cleanDB } from '../../../../../../scripts/db/clean-db'
import { 环境变量 } from '../../../../../global/env'
import { kysely管理器, 系统配置ID } from '../../../../../global/global'
import 接口 from './index'

let adminId = randomUUID()
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
      .values({ id: adminId, name: name, pwd: await bcrypt.hash(pwd, 环境变量.BCRYPT_ROUNDS), is_admin: 1 })
      .execute()
  },
  async (): Promise<void> => {
    let 结果 = await 接口
      .获得接口逻辑()
      .调用(
        { userId: adminId, kysely: kysely管理器, json: { name: 'user', pwd: '123456', isAdmin: true } },
        {},
        默认请求附加参数,
      )
    assert.strictEqual(结果.isRight(), true)
    let db = kysely管理器.获得句柄()
    let 新用户 = await db
      .selectFrom('user')
      .select(['id', 'name', 'is_admin'])
      .where('name', '=', 'user')
      .executeTakeFirst()
    assert.strictEqual(新用户?.name, 'user')
    assert.strictEqual(新用户.is_admin, 1)
    let 用户配置 = await db
      .selectFrom('user_config')
      .select('user_id')
      .where('user_id', '=', 新用户.id)
      .executeTakeFirst()
    assert.strictEqual(用户配置?.user_id, 新用户.id)
  },
)
