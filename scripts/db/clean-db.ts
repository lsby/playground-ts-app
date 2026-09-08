import { CompiledQuery, Kysely } from 'kysely'
import { 环境变量 } from '../../src/global/env'
import { DB } from '../../src/types/db'

export async function cleanDB(db: Kysely<DB>): Promise<void> {
  let 数据库类型 = 环境变量.DB_TYPE

  switch (数据库类型) {
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
    case 'pg': {
      try {
        // 获取所有表的名称
        let 所有表 = (
          await db.executeQuery<{ tablename: string }>(
            CompiledQuery.raw(
              `
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                AND tablename <> '_prisma_migrations'
              `,
              [],
            ),
          )
        ).rows.map((行) => 行.tablename)

        // 清除每个表的数据
        for (let 表 of 所有表) {
          await db.executeQuery(CompiledQuery.raw(`TRUNCATE TABLE "${表}" CASCADE`, []))
        }
      } catch (错误) {
        console.error('清理数据库失败:', 错误)
      }

      break
    }
    case 'mysql': {
      throw new Error('暂不支持 mysql 数据库清理')
    }
  }
}
