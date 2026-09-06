import { 接口测试 } from '@lsby/net-core'
import assert from 'assert'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { cleanDB } from '../../../../scripts/db/clean-db'
import { 环境变量 } from '../../../global/env'
import { kysely管理器, 系统配置ID } from '../../../global/global'
import 接口 from './index'

let name = 'admin'
let pwd = '123456'
export default new 接口测试(
  接口,
  '成功',
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
    let urlPath = 接口.获得路径()
    let url = `http://127.0.0.1:${环境变量.APP_PORT}${urlPath}`

    let response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: '' },
      body: JSON.stringify({}),
    })
    return await response.json()
  },
  async (解析结果): Promise<void> => {
    assert.equal(解析结果.data.isLogin, false)
  },
)
