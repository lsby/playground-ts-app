import { 接口逻辑测试, 默认请求附加参数 } from '@lsby/net-core'
import assert from 'assert'
import 接口 from './index'

export default new 接口逻辑测试(
  async (): Promise<void> => {},
  async (): Promise<void> => {
    let 结果 = await 接口.获得接口逻辑().调用({ json: { a: 10, b: 0 } }, {}, 默认请求附加参数)
    assert.strictEqual(结果.isLeft(), true)
    assert.deepStrictEqual(结果.assertLeft().getLeft(), { 错误: '计算失败', 详情: '传入的除数为0' })
  },
)
