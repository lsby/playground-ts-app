import { DatabaseConnection, Kysely, sql } from 'kysely'
import { z } from 'zod'
import { DB } from '../../types/db'
import { 浏览器迁移列表 } from './local-schema'

type Worker数据库连接 = DatabaseConnection & { request: <T>(type: string, payload?: unknown) => Promise<T> }
type 迁移记录 = {
  migration_name: string
  checksum: string
  finished_at: string | number | null
  rolled_back_at: string | number | null
}

let 迁移记录模式 = z
  .object({
    migration_name: z.string(),
    checksum: z.string(),
    finished_at: z.union([z.string(), z.number(), z.null()]),
    rolled_back_at: z.union([z.string(), z.number(), z.null()]),
  })
  .strict()

export async function 执行SQLite脚本(数据库: Kysely<DB>, SQL: string): Promise<void> {
  await 数据库.getExecutor().provideConnection(async (连接): Promise<void> => {
    let Worker连接 = 连接 as Worker数据库连接
    await Worker连接.request('execute-script', SQL)
  })
}

async function 读取迁移记录(数据库: Kysely<DB>): Promise<Map<string, 迁移记录>> {
  let 查询结果 = await sql<迁移记录>`
    SELECT migration_name, checksum, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    ORDER BY started_at
  `.execute(数据库)
  let 结果 = new Map<string, 迁移记录>()
  for (let 原始记录 of 查询结果.rows) {
    let 记录 = 迁移记录模式.parse(原始记录)
    if (记录.finished_at === null && 记录.rolled_back_at === null)
      throw new Error(`检测到未完成的浏览器迁移: ${记录.migration_name}`)
    if (记录.finished_at !== null && 记录.rolled_back_at !== null)
      throw new Error(`浏览器迁移同时标记为完成和回滚: ${记录.migration_name}`)
    if (记录.rolled_back_at !== null) continue
    if (结果.has(记录.migration_name) === true) throw new Error(`浏览器迁移记录重复: ${记录.migration_name}`)
    结果.set(记录.migration_name, 记录)
  }
  return 结果
}

export async function 应用浏览器迁移(数据库: Kysely<DB>): Promise<void> {
  await 执行SQLite脚本(
    数据库,
    `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    );`,
  )
  let 已完成记录表 = await 读取迁移记录(数据库)
  if (已完成记录表.size === 0) {
    let 已有业务表 = await sql<{ name: string }>`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'
    `.execute(数据库)
    let 初始迁移 = 浏览器迁移列表[0]
    if (已有业务表.rows.length !== 0) {
      if (初始迁移 === undefined) throw new Error('浏览器数据库存在业务表，但没有可接管的初始迁移')
      let 当前时间 = Date.now()
      await sql`
        INSERT INTO "_prisma_migrations"
          ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
        VALUES
          (${crypto.randomUUID()}, ${初始迁移.校验和}, ${当前时间}, ${初始迁移.名称}, ${当前时间}, 1)
      `.execute(数据库)
      已完成记录表 = await 读取迁移记录(数据库)
    }
  }
  let 迁移定义表 = new Map(浏览器迁移列表.map((迁移) => [迁移.名称, 迁移]))
  for (let 记录 of 已完成记录表.values()) {
    let 迁移 = 迁移定义表.get(记录.migration_name)
    if (迁移 === undefined) throw new Error(`浏览器数据库存在未知迁移: ${记录.migration_name}`)
    if (迁移.校验和 !== 记录.checksum) throw new Error(`浏览器迁移 checksum 不一致: ${记录.migration_name}`)
  }
  let 待执行迁移 = 浏览器迁移列表.filter((迁移) => 已完成记录表.has(迁移.名称) === false)
  if (待执行迁移.length === 0) return

  await sql`PRAGMA foreign_keys = OFF`.execute(数据库)
  try {
    await 数据库.transaction().execute(async (事务): Promise<void> => {
      for (let 迁移 of 待执行迁移) {
        await 执行SQLite脚本(事务, 迁移.SQL)
        let 当前时间 = Date.now()
        await sql`
          INSERT INTO "_prisma_migrations"
            ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
          VALUES
            (${crypto.randomUUID()}, ${迁移.校验和}, ${当前时间}, ${迁移.名称}, ${当前时间}, 1)
        `.execute(事务)
      }
      let 外键错误 = await sql<{
        table: string
        rowid: number | null
        parent: string
        fkid: number
      }>`PRAGMA foreign_key_check`.execute(事务)
      if (外键错误.rows.length !== 0) throw new Error('浏览器迁移完成后存在外键约束错误')
    })
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(数据库)
  }
  return
}
