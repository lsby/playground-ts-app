import { 接口逻辑测试, 默认请求附加参数 } from '@lsby/net-core'
import assert from 'assert'
import { cleanDB } from '../../../../scripts/db/clean-db'
import { kysely管理器, 系统配置ID } from '../../../global/global'
import 接口 from './index'

export default new 接口逻辑测试(
  async (): Promise<void> => {
    let db = kysely管理器.获得句柄()
    await cleanDB(db)
    await db
      .insertInto('system_config')
      .values({ id: 系统配置ID, is_initialized: 1, enable_register: 1, version: '', jwt_secret: '123' })
      .execute()
  },
  async (): Promise<void> => {
    let 结果 = await 接口
      .获得接口逻辑()
      .调用({ kysely: kysely管理器, json: { userName: 'admin', userPassword: '123456' } }, {}, 默认请求附加参数)
    assert.strictEqual(结果.isRight(), true)
    let db = kysely管理器.获得句柄()
    let r = await db.selectFrom('user').select('id').execute()
    assert.strictEqual(r.length, 1, '应该有一个用户')
  },
)
