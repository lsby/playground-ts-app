import { 接口逻辑测试, 默认请求附加参数 } from '@lsby/net-core'
import assert from 'assert'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { cleanDB } from '../../../../../scripts/db/clean-db'
import { 环境变量 } from '../../../../global/env'
import { kysely管理器, 系统配置ID } from '../../../../global/global'
import 接口 from './index'

let userId = randomUUID()
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
      .values({ id: userId, name: name, pwd: await bcrypt.hash(pwd, 环境变量.BCRYPT_ROUNDS), is_admin: 0 })
      .execute()
  },
  async (): Promise<void> => {
    let 模拟文件 = {
      fieldname: 'file',
      originalname: 'test-image.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: 11,
      buffer: Buffer.from('hello world'),
    }

    let 结果 = await 接口
      .获得接口逻辑()
      .调用(
        { userId: userId, kysely: kysely管理器, form: { data: { description: '测试文件描述' }, files: [模拟文件] } },
        {},
        默认请求附加参数,
      )
    assert.strictEqual(结果.isRight(), true)
    let 响应数据 = 结果.assertRight().getRight()
    assert.strictEqual(响应数据.message, '成功上传 1 个文件')
    assert.strictEqual(响应数据.files.length, 1)
    assert.strictEqual(响应数据.files[0]?.name, 'test-image.png')
  },
)
