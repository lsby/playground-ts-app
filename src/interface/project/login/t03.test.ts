import { 接口测试 } from '@lsby/net-core'
import assert from 'assert'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { cleanDB } from '../../../../scripts/db/clean-db'
import { 环境变量 } from '../../../global/env'
import { kysely管理器, 系统配置ID } from '../../../global/global'
import { POST_JSON请求用例 } from '../../../tools/request'
import 接口 from './index'

let name = 'admin'
let pwd = '123456'
export default new 接口测试(
  接口,
  '失败',
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
  async (): Promise<object> => {
    return POST_JSON请求用例(接口, { userName: name, userPassword: pwd + '!' })
  },
  async (解析结果): Promise<void> => {
    assert.equal(解析结果.data, '用户不存在或密码错误')
  },
)
