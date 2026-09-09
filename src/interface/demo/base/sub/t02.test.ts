import { 接口逻辑测试, 默认请求附加参数 } from '@lsby/net-core'
import assert from 'assert'
import { kysely管理器 } from '../../../../global/global'
import 接口 from './index'

export default new 接口逻辑测试(
  async (): Promise<void> => {},
  async (): Promise<void> => {
    let 结果 = await 接口
      .获得接口逻辑()
      .调用({ userId: undefined, kysely: kysely管理器, json: { a: 2, b: 1 } }, {}, 默认请求附加参数)
    assert.strictEqual(结果.isLeft(), true)
    assert.strictEqual(结果.assertLeft().getLeft(), '未登录')
  },
)
