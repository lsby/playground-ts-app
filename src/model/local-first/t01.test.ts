import { 接口逻辑测试 } from '@lsby/net-core'
import assert from 'assert'
import { 数据库快照, 规范化数据库快照, 计算数据库快照哈希 } from './sync-model'

export default new 接口逻辑测试(
  async (): Promise<void> => {},
  async (): Promise<void> => {
    let 左快照: 数据库快照 = {
      user_config: [
        { id: 'config-2', user_id: 'user-2', theme: '暗色' },
        { id: 'config-1', user_id: 'user-1', theme: '亮色' },
      ],
      user: [
        { id: 'user-2', name: '李四', is_admin: 0 },
        { id: 'user-1', name: '张三', is_admin: 1 },
      ],
    }
    let 右快照: 数据库快照 = {
      user: [
        { name: '张三', is_admin: 1, id: 'user-1' },
        { is_admin: 0, id: 'user-2', name: '李四' },
      ],
      user_config: [
        { theme: '亮色', user_id: 'user-1', id: 'config-1' },
        { user_id: 'user-2', id: 'config-2', theme: '暗色' },
      ],
    }

    assert.strictEqual(规范化数据库快照(左快照), 规范化数据库快照(右快照))
    assert.strictEqual(await 计算数据库快照哈希('schema-1', 左快照), await 计算数据库快照哈希('schema-1', 右快照))

    let 修改后快照 = structuredClone(右快照)
    let 用户配置 = 修改后快照['user_config']?.[0]
    if (用户配置 === undefined) throw new Error('测试快照缺少用户配置')
    用户配置['theme'] = '系统'
    assert.notStrictEqual(
      await 计算数据库快照哈希('schema-1', 左快照),
      await 计算数据库快照哈希('schema-1', 修改后快照),
    )
    assert.notStrictEqual(await 计算数据库快照哈希('schema-1', 左快照), await 计算数据库快照哈希('schema-2', 左快照))
  },
)
