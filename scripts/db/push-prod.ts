import { execSync } from 'child_process'
import crypto from 'crypto'
import dotenv from 'dotenv'
import fs from 'fs'
import sqlite3 from 'node-sqlite3-wasm'
import path from 'path'

type 迁移 = { 名称: string; SQL内容: string; 校验和: string }
type 已完成迁移记录 = { 名称: string; 校验和: string }

let 获得错误消息 = (错误: unknown): string => (错误 instanceof Error ? 错误.message : String(错误))

let 获得环境文件参数 = (): string | null => {
  let 环境文件参数 = process.argv[2]
  if (环境文件参数 === undefined || 环境文件参数 === '' || 环境文件参数.startsWith('--') === true) {
    return null
  }
  return 环境文件参数
}

let 读取字符串 = (值: unknown, 字段名: string): string => {
  if (typeof 值 !== 'string') {
    throw new Error(`迁移记录字段 ${字段名} 不是字符串`)
  }
  return 值
}

let 读取可空迁移时间 = (值: unknown, 字段名: string): string | number | bigint | null => {
  if (值 === null) {
    return null
  }
  if (typeof 值 !== 'string' && typeof 值 !== 'number' && typeof 值 !== 'bigint') {
    throw new Error(`迁移记录字段 ${字段名} 不是有效时间`)
  }
  return 值
}

let 获得数据库路径 = (): string => {
  let 环境文件参数 = 获得环境文件参数()
  if (环境文件参数 !== null) {
    dotenv.config({ path: 环境文件参数 })
  } else {
    let 环境文件路径 = process.env['ENV_FILE_PATH']
    if (环境文件路径 !== undefined && 环境文件路径 !== '') {
      dotenv.config({ path: 环境文件路径 })
    }
  }

  let 数据库地址 = process.env['DB_PATH_PRISMA'] ?? process.env['DB_PATH']
  if (数据库地址 === undefined || 数据库地址 === '') {
    throw new Error('缺少 DB_PATH_PRISMA 或 DB_PATH 环境变量')
  }

  let 数据库路径 = 数据库地址.replace(/^file:/, '').replace(/^\.\//, '')
  if (数据库路径.includes('${DB_PATH}') === true) {
    let 数据库路径变量 = process.env['DB_PATH']
    if (数据库路径变量 === undefined || 数据库路径变量 === '') {
      throw new Error('DB_PATH_PRISMA 引用了 DB_PATH，但 DB_PATH 未配置')
    }
    数据库路径 = 数据库路径.replaceAll('${DB_PATH}', 数据库路径变量.replace(/^\.\//, ''))
  }
  return path.resolve(process.cwd(), 数据库路径)
}

let 读取迁移组 = (迁移目录: string): 迁移[] => {
  if (fs.existsSync(迁移目录) === false) {
    return []
  }
  let 迁移目录项组 = fs.readdirSync(迁移目录, { withFileTypes: true }).filter((目录项) => 目录项.isDirectory())
  if (迁移目录项组.length === 0) {
    return []
  }

  return 迁移目录项组
    .sort((左, 右) => 左.name.localeCompare(右.name))
    .map((目录项): 迁移 => {
      let SQL路径 = path.join(迁移目录, 目录项.name, 'migration.sql')
      if (fs.existsSync(SQL路径) === false || fs.statSync(SQL路径).isFile() === false) {
        throw new Error(`迁移目录缺少 migration.sql: ${目录项.name}`)
      }
      let SQL内容 = fs.readFileSync(SQL路径, 'utf8')
      return { 名称: 目录项.name, SQL内容, 校验和: crypto.createHash('sha256').update(SQL内容).digest('hex') }
    })
}

let 执行Prisma命令 = (命令: 'db push' | 'generate'): void => {
  execSync(`prisma ${命令}`, { stdio: 'inherit' })
}

let 确保迁移记录表 = (数据库: sqlite3.Database): void => {
  数据库.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    );
  `)
}

let 读取已完成迁移记录表 = (数据库: sqlite3.Database): Map<string, 已完成迁移记录> => {
  let 结果 = new Map<string, 已完成迁移记录>()
  let 记录组 = 数据库.all(`
    SELECT migration_name, checksum, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    ORDER BY started_at
  `)

  for (let 记录 of 记录组) {
    let 名称 = 读取字符串(记录['migration_name'], 'migration_name')
    let 校验和 = 读取字符串(记录['checksum'], 'checksum')
    let 完成时间 = 读取可空迁移时间(记录['finished_at'], 'finished_at')
    let 回滚时间 = 读取可空迁移时间(记录['rolled_back_at'], 'rolled_back_at')
    if (完成时间 === null && 回滚时间 === null) {
      throw new Error(`检测到未完成的迁移记录: ${名称}`)
    }
    if (完成时间 !== null && 回滚时间 !== null) {
      throw new Error(`迁移记录同时标记为完成和回滚: ${名称}`)
    }
    if (回滚时间 !== null) {
      continue
    }
    if (结果.has(名称) === true) {
      throw new Error(`检测到重复的已完成迁移记录: ${名称}`)
    }
    结果.set(名称, { 名称, 校验和 })
  }
  return 结果
}

let 校验已完成迁移 = (迁移组: 迁移[], 已完成记录表: Map<string, 已完成迁移记录>): void => {
  let 迁移表 = new Map(迁移组.map((迁移) => [迁移.名称, 迁移]))
  for (let 记录 of 已完成记录表.values()) {
    let 迁移 = 迁移表.get(记录.名称)
    if (迁移 === undefined) {
      throw new Error(`数据库存在迁移记录，但本地缺少对应迁移文件: ${记录.名称}`)
    }
    if (迁移.校验和 !== 记录.校验和) {
      throw new Error(`已应用迁移的 checksum 不一致: ${记录.名称}`)
    }
  }
}

let 在事务中执行 = <结果>(数据库: sqlite3.Database, 操作: () => 结果): 结果 => {
  数据库.exec('PRAGMA foreign_keys = OFF')
  try {
    数据库.exec('BEGIN IMMEDIATE')
    let 操作结果 = 操作()
    if (数据库.all('PRAGMA foreign_key_check').length > 0) {
      throw new Error('迁移完成后检测到外键约束错误')
    }
    数据库.exec('COMMIT')
    return 操作结果
  } catch (错误) {
    if (数据库.inTransaction === true) {
      数据库.exec('ROLLBACK')
    }
    throw 错误
  } finally {
    数据库.exec('PRAGMA foreign_keys = ON')
  }
}

let 标记迁移为已应用 = (数据库: sqlite3.Database, 迁移: 迁移): void => {
  let 是否新标记 = 在事务中执行(数据库, (): boolean => {
    let 已完成记录表 = 读取已完成迁移记录表(数据库)
    let 已完成记录 = 已完成记录表.get(迁移.名称)
    if (已完成记录 !== undefined) {
      if (已完成记录.校验和 !== 迁移.校验和) {
        throw new Error(`已应用迁移的 checksum 不一致: ${迁移.名称}`)
      }
      return false
    }
    let 当前时间 = Date.now()
    数据库.run(
      `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") VALUES (?, ?, ?, ?, ?, 1)`,
      [crypto.randomUUID(), 迁移.校验和, 当前时间, 迁移.名称, 当前时间],
    )
    return true
  })
  console.log(是否新标记 === true ? `成功将迁移标记为已应用: ${迁移.名称}` : `迁移已经标记为已应用: ${迁移.名称}`)
}

let 执行迁移 = (数据库: sqlite3.Database, 迁移: 迁移): void => {
  let 是否执行 = 在事务中执行(数据库, (): boolean => {
    let 已完成记录表 = 读取已完成迁移记录表(数据库)
    let 已完成记录 = 已完成记录表.get(迁移.名称)
    if (已完成记录 !== undefined) {
      if (已完成记录.校验和 !== 迁移.校验和) {
        throw new Error(`已应用迁移的 checksum 不一致: ${迁移.名称}`)
      }
      return false
    }
    数据库.exec(迁移.SQL内容)
    let 当前时间 = Date.now()
    数据库.run(
      `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") VALUES (?, ?, ?, ?, ?, 1)`,
      [crypto.randomUUID(), 迁移.校验和, 当前时间, 迁移.名称, 当前时间],
    )
    return true
  })
  console.log(是否执行 === true ? `迁移成功: ${迁移.名称}` : `迁移已应用，跳过: ${迁移.名称}`)
}

let 主函数 = (): void => {
  let 数据库路径 = 获得数据库路径()
  process.env['DB_PATH_PRISMA'] = `file:${数据库路径.replaceAll('\\', '/')}`
  let 迁移组 = 读取迁移组(path.join(process.cwd(), 'prisma', 'migrations'))
  let 是否本地命令 = 获得环境文件参数() !== null
  if (迁移组.length === 0) {
    if (是否本地命令 === false) {
      throw new Error('未检测到任何迁移，打包环境不能使用 Prisma db push')
    }
    console.log('未检测到任何迁移，使用 Prisma db push 初始化数据库')
    执行Prisma命令('db push')
    执行Prisma命令('generate')
    return
  }
  let 数据库目录 = path.dirname(数据库路径)
  if (fs.existsSync(数据库目录) === false) {
    fs.mkdirSync(数据库目录, { recursive: true })
  }

  console.log(`开始执行原生 SQL 迁移，数据库: ${数据库路径}`)
  let 数据库 = new sqlite3.Database(数据库路径)
  try {
    确保迁移记录表(数据库)
    let 已完成记录表 = 读取已完成迁移记录表(数据库)
    校验已完成迁移(迁移组, 已完成记录表)

    let 参数组 = process.argv.slice(2)
    let 标记参数位置 = 参数组.indexOf('--applied')
    if (标记参数位置 !== -1) {
      let 迁移名称 = 参数组[标记参数位置 + 1]
      if (迁移名称 === undefined || 迁移名称 === '' || 迁移名称.startsWith('--') === true) {
        throw new Error('缺少 --applied 参数值')
      }
      let 迁移 = 迁移组.find((候选迁移) => 候选迁移.名称 === 迁移名称)
      if (迁移 === undefined) {
        throw new Error(`--applied 指定的迁移不存在: ${迁移名称}`)
      }
      标记迁移为已应用(数据库, 迁移)
    } else {
      for (let 迁移 of 迁移组) {
        执行迁移(数据库, 迁移)
      }
      console.log('所有迁移已成功应用')
    }
  } finally {
    数据库.close()
  }
  if (是否本地命令 === true) {
    执行Prisma命令('generate')
  }
}

try {
  主函数()
} catch (错误) {
  console.error(`数据库迁移失败: ${获得错误消息(错误)}`)
  process.exitCode = 1
}
