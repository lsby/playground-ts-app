import { 默认请求附加参数 } from '@lsby/net-core'
import assert from 'assert'
import { randomUUID } from 'crypto'
import { cleanDB } from '../../scripts/db/clean-db'
import { 环境变量 } from '../../src/global/env'
import { kysely管理器 } from '../../src/global/global'
import { init } from '../../src/init/init'
import 拉取接口 from '../../src/interface/system/local-first/pull/index'
import 提交接口 from '../../src/interface/system/local-first/push/index'
import { 数据库快照 } from '../../src/model/local-first/sync-model'
import { 本地数据库Schema指纹 } from '../../src/types/local-first-database-meta'

function 修改主题(数据库: 数据库快照, 主题: '系统' | '亮色' | '暗色'): 数据库快照 {
  let 结果 = structuredClone(数据库)
  let 用户配置 = 结果['user_config']?.[0]
  if (用户配置 === undefined) throw new Error('同步快照缺少用户配置')
  用户配置['theme'] = 主题
  return 结果
}

async function 主函数(): Promise<void> {
  console.log('========== 本地优先同步集成测试 ==========')
  let 数据库 = kysely管理器.获得句柄()
  await cleanDB(数据库)
  await init()

  let 管理员 = await 数据库
    .selectFrom('user')
    .select('id')
    .where('name', '=', 环境变量.DEFAULT_SYSTEM_USER)
    .executeTakeFirst()
  if (管理员 === undefined) throw new Error('初始化后未找到管理员')
  let 管理员id = 管理员.id

  let 其他用户id = randomUUID()
  await 数据库
    .insertInto('user')
    .values({ id: 其他用户id, name: '本地优先测试用户', pwd: '不参与测试', is_admin: 0 })
    .execute()
  await 数据库.insertInto('user_config').values({ id: randomUUID(), user_id: 其他用户id, theme: '亮色' }).execute()

  let 未登录拉取 = await 拉取接口
    .获得接口逻辑()
    .调用({ json: {}, userId: undefined, kysely: kysely管理器 }, {}, 默认请求附加参数)
  assert.strictEqual(未登录拉取.isLeft(), true)
  assert.strictEqual(未登录拉取.assertLeft().getLeft().code, 'NOT_LOGGED_IN')

  let 拉取结果 = await 拉取接口
    .获得接口逻辑()
    .调用({ json: {}, userId: 管理员id, kysely: kysely管理器 }, {}, 默认请求附加参数)
  assert.strictEqual(拉取结果.isRight(), true)
  let 初始快照 = 拉取结果.assertRight().getRight()
  assert.strictEqual(初始快照.userId, 管理员id)
  assert.strictEqual(初始快照.schemaFingerprint, 本地数据库Schema指纹)
  assert.deepStrictEqual(Object.keys(初始快照.database).sort(), ['user', 'user_config'])
  let 用户列表 = 初始快照.database['user']
  let 用户配置列表 = 初始快照.database['user_config']
  assert.strictEqual(用户列表?.length, 1)
  assert.strictEqual(用户配置列表?.length, 1)
  let 用户 = 用户列表[0]
  let 用户配置 = 用户配置列表[0]
  assert.ok(用户 !== undefined)
  assert.ok(用户配置 !== undefined)
  assert.strictEqual(用户['id'], 管理员id)
  assert.strictEqual(用户['pwd'], '<不显示>')
  assert.strictEqual(用户配置['user_id'], 管理员id)

  let 错误Schema提交 = await 提交接口
    .获得接口逻辑()
    .调用(
      {
        json: {
          schemaFingerprint: `${本地数据库Schema指纹}-错误`,
          expectedDataHash: 初始快照.dataHash,
          database: 初始快照.database,
        },
        userId: 管理员id,
        kysely: kysely管理器,
      },
      {},
      默认请求附加参数,
    )
  assert.strictEqual(错误Schema提交.isLeft(), true)
  assert.strictEqual(错误Schema提交.assertLeft().getLeft().code, 'SCHEMA_MISMATCH')

  let 暗色数据库 = 修改主题(初始快照.database, '暗色')
  let 成功提交 = await 提交接口
    .获得接口逻辑()
    .调用(
      {
        json: {
          schemaFingerprint: 初始快照.schemaFingerprint,
          expectedDataHash: 初始快照.dataHash,
          database: 暗色数据库,
        },
        userId: 管理员id,
        kysely: kysely管理器,
      },
      {},
      默认请求附加参数,
    )
  assert.strictEqual(成功提交.isRight(), true)
  assert.strictEqual(成功提交.assertRight().getRight().database['user_config']?.[0]?.['theme'], '暗色')
  let 服务端主题 = await 数据库
    .selectFrom('user_config')
    .select('theme')
    .where('user_id', '=', 管理员id)
    .executeTakeFirst()
  assert.strictEqual(服务端主题?.theme, '暗色')

  let 过期快照 = 成功提交.assertRight().getRight()
  await 数据库.updateTable('user_config').set({ theme: '亮色' }).where('user_id', '=', 管理员id).execute()
  let 过期提交 = await 提交接口
    .获得接口逻辑()
    .调用(
      {
        json: {
          schemaFingerprint: 过期快照.schemaFingerprint,
          expectedDataHash: 过期快照.dataHash,
          database: 修改主题(过期快照.database, '系统'),
        },
        userId: 管理员id,
        kysely: kysely管理器,
      },
      {},
      默认请求附加参数,
    )
  assert.strictEqual(过期提交.isLeft(), true)
  assert.strictEqual(过期提交.assertLeft().getLeft().code, 'REMOTE_DATA_CHANGED')
  服务端主题 = await 数据库.selectFrom('user_config').select('theme').where('user_id', '=', 管理员id).executeTakeFirst()
  assert.strictEqual(服务端主题?.theme, '亮色')

  let 最新拉取 = await 拉取接口
    .获得接口逻辑()
    .调用({ json: {}, userId: 管理员id, kysely: kysely管理器 }, {}, 默认请求附加参数)
  assert.strictEqual(最新拉取.isRight(), true)
  let 最新快照 = 最新拉取.assertRight().getRight()
  let 越界数据库 = structuredClone(最新快照.database)
  越界数据库['system_config'] = []
  let 越界提交 = await 提交接口
    .获得接口逻辑()
    .调用(
      {
        json: {
          schemaFingerprint: 最新快照.schemaFingerprint,
          expectedDataHash: 最新快照.dataHash,
          database: 越界数据库,
        },
        userId: 管理员id,
        kysely: kysely管理器,
      },
      {},
      默认请求附加参数,
    )
  assert.strictEqual(越界提交.isLeft(), true)
  assert.strictEqual(越界提交.assertLeft().getLeft().code, 'INVALID_SYNC_DATABASE')

  let 他人数据库 = structuredClone(最新快照.database)
  let 他人用户 = 他人数据库['user']?.[0]
  if (他人用户 === undefined) throw new Error('同步快照缺少用户')
  他人用户['id'] = 其他用户id
  let 他人提交 = await 提交接口
    .获得接口逻辑()
    .调用(
      {
        json: {
          schemaFingerprint: 最新快照.schemaFingerprint,
          expectedDataHash: 最新快照.dataHash,
          database: 他人数据库,
        },
        userId: 管理员id,
        kysely: kysely管理器,
      },
      {},
      默认请求附加参数,
    )
  assert.strictEqual(他人提交.isLeft(), true)
  assert.strictEqual(他人提交.assertLeft().getLeft().code, 'INVALID_SYNC_DATABASE')

  let 其他用户拉取 = await 拉取接口
    .获得接口逻辑()
    .调用({ json: {}, userId: 其他用户id, kysely: kysely管理器 }, {}, 默认请求附加参数)
  assert.strictEqual(其他用户拉取.isRight(), true)
  assert.strictEqual(其他用户拉取.assertRight().getRight().database['user']?.[0]?.['id'], 其他用户id)
  assert.strictEqual(其他用户拉取.assertRight().getRight().database['user_config']?.[0]?.['theme'], '亮色')

  服务端主题 = await 数据库.selectFrom('user_config').select('theme').where('user_id', '=', 管理员id).executeTakeFirst()
  assert.strictEqual(服务端主题?.theme, '亮色')
  console.log('✅ 本地优先拉取、提交、并发哈希和用户数据隔离验证通过')
  process.exit(0)
}

主函数().catch((错误) => {
  console.error(错误)
  process.exit(1)
})
