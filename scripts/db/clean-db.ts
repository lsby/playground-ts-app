import { CompiledQuery, Kysely } from 'kysely'
import { 环境变量 } from '../../src/global/env'
import { DB } from '../../src/types/db'

export async function cleanDB(db: Kysely<DB>): Promise<void> {
  let 数据库类型 = 环境变量.DB_TYPE

  switch (数据库类型) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case 'sqlite': {
      let 删除语句 = (
        await db.executeQuery<{ name: string }>(
          CompiledQuery.raw(
            [
              // ..
              `SELECT name`,
              `FROM sqlite_master`,
              `WHERE type = 'table'`,
              `AND name NOT LIKE 'sqlite_%'`,
              `AND name <> '_prisma_migrations';`,
            ].join('\n'),
            [],
          ),
        )
      ).rows.map((行) => `DELETE FROM ${行.name};`)

      // 关闭外键约束
      await db.executeQuery(CompiledQuery.raw('PRAGMA foreign_keys = OFF;', []))

      // 开始事务
      await db.transaction().execute(async (事务) => {
        for (let 语句 of 删除语句) {
          await 事务.executeQuery(CompiledQuery.raw(语句, []))
        }
      })

      // 打开外键约束
      await db.executeQuery(CompiledQuery.raw('PRAGMA foreign_keys = ON;', []))

      break
    }
  }
}
