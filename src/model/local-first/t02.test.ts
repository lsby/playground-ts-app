import { 接口逻辑测试 } from '@lsby/net-core'
import assert from 'assert'
import { 三方合并数据库, 数据库快照 } from './sync-model'

export default new 接口逻辑测试(
  async (): Promise<void> => {},
  async (): Promise<void> => {
    let 基线: 数据库快照 = {
      item: [
        { id: '1', name: '旧名称', color: '白色' },
        { id: '2', name: '远程删除' },
        { id: '3', name: '本地删除' },
      ],
    }
    let 本地: 数据库快照 = {
      item: [
        { id: '1', name: '本地名称', color: '白色' },
        { id: '2', name: '远程删除' },
        { id: '4', name: '本地新增' },
        { id: '6', name: '双方相同新增' },
      ],
    }
    let 远程: 数据库快照 = {
      item: [
        { id: '1', name: '旧名称', color: '黑色' },
        { id: '3', name: '本地删除' },
        { id: '5', name: '远程新增' },
        { id: '6', name: '双方相同新增' },
      ],
    }

    let 结果 = 三方合并数据库(远程, 基线, 本地, { item: ['id'] })
    assert.strictEqual(结果.状态, '成功')
    assert.deepStrictEqual(结果.数据库, {
      item: [
        { color: '黑色', id: '1', name: '本地名称' },
        { id: '4', name: '本地新增' },
        { id: '5', name: '远程新增' },
        { id: '6', name: '双方相同新增' },
      ],
    })
  },
)
