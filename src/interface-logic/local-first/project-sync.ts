import { Kysely } from 'kysely'
import { z } from 'zod'
import { 数据库快照, 数据库快照模式 } from '../../model/local-first/sync-model'
import { DB } from '../../types/db'

let 用户行模式 = z
  .object({ id: z.string(), created_at: z.string(), name: z.string(), pwd: z.string(), is_admin: z.number().int() })
  .strict()
let 用户配置行模式 = z
  .object({ id: z.string(), created_at: z.string(), user_id: z.string(), theme: z.enum(['系统', '亮色', '暗色']) })
  .strict()

export let 本地优先同步表列表 = ['user', 'user_config'] as const

export async function 读取同步数据库(数据库: Kysely<DB>, 用户id: string): Promise<数据库快照> {
  let 用户 = await 数据库
    .selectFrom('user')
    .select(['id', 'created_at', 'name', 'is_admin'])
    .where('id', '=', 用户id)
    .executeTakeFirst()
  if (用户 === undefined) throw new Error('本地优先同步时未找到当前用户')
  let 用户配置 = await 数据库.selectFrom('user_config').selectAll().where('user_id', '=', 用户id).executeTakeFirst()
  if (用户配置 === undefined) throw new Error('本地优先同步时未找到当前用户配置')
  return 数据库快照模式.parse({ user: [{ ...用户, pwd: '<不显示>' }], user_config: [用户配置] })
}

export async function 写入同步数据库(数据库: Kysely<DB>, 用户id: string, 快照: 数据库快照): Promise<void> {
  let 表名列表 = Object.keys(快照).sort((左, 右) => 左.localeCompare(右))
  if (JSON.stringify(表名列表) !== JSON.stringify([...本地优先同步表列表].sort((左, 右) => 左.localeCompare(右))))
    throw new Error('上传数据库的表范围与本地优先同步定义不一致')
  let 用户列表 = z.array(用户行模式).parse(快照['user'])
  let 用户配置列表 = z.array(用户配置行模式).parse(快照['user_config'])
  if (用户列表.length !== 1 || 用户列表[0]?.id !== 用户id) throw new Error('上传数据库的用户范围不合法')
  let 用户配置 = 用户配置列表[0]
  if (用户配置列表.length !== 1 || 用户配置 === undefined || 用户配置.user_id !== 用户id)
    throw new Error('上传数据库的用户配置范围不合法')
  let 更新结果 = await 数据库
    .updateTable('user_config')
    .set({ theme: 用户配置.theme })
    .where('id', '=', 用户配置.id)
    .where('user_id', '=', 用户id)
    .executeTakeFirst()
  if (更新结果.numUpdatedRows !== 1n) throw new Error('同步用户配置失败')
}
