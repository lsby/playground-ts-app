import { 接口逻辑测试 } from '@lsby/net-core'
import assert from 'assert'
import { 三方合并数据库, 数据库快照 } from './sync-model'

export default new 接口逻辑测试(
  async (): Promise<void> => {},
  async (): Promise<void> => {
    let 基线: 数据库快照 = { item: [{ id: '1', name: '原值' }] }
    let 本地: 数据库快照 = { item: [{ id: '1', name: '本地值' }] }
    let 远程: 数据库快照 = { item: [{ id: '1', name: '远程值' }] }
    let 字段冲突 = 三方合并数据库(远程, 基线, 本地, { item: ['id'] })
    assert.strictEqual(字段冲突.状态, '冲突')
    assert.deepStrictEqual(字段冲突.冲突列表, [
      { 表名: 'item', 主键: { id: '1' }, 字段名: 'name', 基线值: '原值', 本地值: '本地值', 远程值: '远程值' },
    ])

    let 删除冲突 = 三方合并数据库({ item: [] }, 基线, 本地, { item: ['id'] })
    assert.strictEqual(删除冲突.状态, '冲突')
    assert.strictEqual(删除冲突.冲突列表[0]?.字段名, null)

    let 并发新增冲突 = 三方合并数据库(
      { item: [{ id: '2', name: '远程新增' }] },
      { item: [] },
      { item: [{ id: '2', name: '本地新增' }] },
      { item: ['id'] },
    )
    assert.strictEqual(并发新增冲突.状态, '冲突')

    assert.throws((): void => {
      三方合并数据库({ item: [] }, { item: [] }, { item: [{ id: '1' }, { id: '1' }] }, { item: ['id'] })
    }, /重复主键/)
    assert.throws((): void => {
      三方合并数据库({ item: [] }, { item: [] }, { item: [{ name: '缺少主键' }] }, { item: ['id'] })
    }, /主键不完整/)
    assert.throws((): void => {
      三方合并数据库({ item: [] }, { item: [] }, { item: [{ id: '1' }] }, {})
    }, /必须具有主键/)
  },
)
