import { 接口逻辑测试, 默认请求附加参数 } from '@lsby/net-core'
import assert from 'assert'
import 接口 from './index'

export default new 接口逻辑测试(
  async (): Promise<void> => {},
  async (): Promise<void> => {
    let 结果 = await 接口.获得接口逻辑().调用({ json: { a: 1, b: 2 } }, {}, 默认请求附加参数)
    assert.strictEqual(结果.isRight(), true)
    assert.strictEqual(结果.assertRight().getRight().res, 3)
  },
)
