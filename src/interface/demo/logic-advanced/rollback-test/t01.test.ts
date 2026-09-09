import { 接口逻辑测试, 默认请求附加参数 } from '@lsby/net-core'
import assert from 'assert'
import { cleanDB } from '../../../../../scripts/db/clean-db'
import { kysely管理器 } from '../../../../global/global'
import 接口 from './index'

let name = 'newUser'
let pwd = '123456'

export default new 接口逻辑测试(
  async (): Promise<void> => {
    let db = kysely管理器.获得句柄()
    await cleanDB(db)
  },
  async (): Promise<void> => {
    let 结果 = await 接口
      .获得接口逻辑()
      .调用({ kysely: kysely管理器, json: { name: name, pwd: pwd } }, {}, 默认请求附加参数)
    assert.strictEqual(结果.isLeft(), true)
    assert.strictEqual(结果.assertLeft().getLeft(), '就要失败')

    let db = kysely管理器.获得句柄()
    let userRow = await db.selectFrom('user').select('id').where('name', '=', name).executeTakeFirst()
    assert.strictEqual(userRow === undefined, true)
  },
)
