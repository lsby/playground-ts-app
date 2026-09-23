import { execSync } from 'child_process'
import crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

type 迁移 = { 名称: string; SQL: string; 校验和: string }

function 写入变化文件(目标文件: string, 新内容: string): void {
  let 已有内容 = fs.existsSync(目标文件) === true ? fs.readFileSync(目标文件, 'utf-8') : ''
  if (已有内容 === 新内容) {
    console.log(`文件 ${目标文件} 内容未变化，跳过写入。`)
    return
  }
  fs.mkdirSync(path.dirname(目标文件), { recursive: true })
  fs.writeFileSync(目标文件, 新内容)
  console.log(`文件 ${目标文件} 已更新。`)
}

function 读取迁移(): 迁移[] {
  let 迁移目录 = 'prisma/migrations'
  if (fs.existsSync(迁移目录) === false) return []
  return fs
    .readdirSync(迁移目录, { withFileTypes: true })
    .filter((项) => 项.isDirectory())
    .sort((左, 右) => 左.name.localeCompare(右.name))
    .map((项): 迁移 => {
      let SQL路径 = path.join(迁移目录, 项.name, 'migration.sql')
      if (fs.existsSync(SQL路径) === false) throw new Error(`迁移缺少 migration.sql: ${项.name}`)
      let SQL = fs.readFileSync(SQL路径, 'utf-8')
      return { 名称: 项.name, SQL, 校验和: crypto.createHash('sha256').update(SQL).digest('hex') }
    })
}

function 读取主键表(SQL: string): Record<string, string[]> {
  let 结果: Record<string, string[]> = {}
  let 建表正则 = /CREATE TABLE\s+"([^"]+)"\s*\(([\s\S]*?)\n\);/g
  for (let 匹配 of SQL.matchAll(建表正则)) {
    let 表名 = 匹配[1]
    let 表体 = 匹配[2]
    if (表名 === undefined || 表体 === undefined) continue
    let 表级主键 = /PRIMARY KEY\s*\(([^)]+)\)/.exec(表体)
    if (表级主键?.[1] !== undefined) {
      结果[表名] = [...表级主键[1].matchAll(/"([^"]+)"/g)]
        .map((字段匹配) => 字段匹配[1])
        .filter((字段名): 字段名 is string => 字段名 !== undefined)
      continue
    }
    let 字段主键 = /"([^"]+)"[^,\n]*PRIMARY KEY/.exec(表体)
    结果[表名] = 字段主键?.[1] === undefined ? [] : [字段主键[1]]
  }
  return 结果
}

function 主函数(): void {
  let stdout = execSync('prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', {
    encoding: 'utf-8',
    env: { ...process.env, DB_PATH_PRISMA: 'file:./db/generate-local-schema.db' },
  })
  let SQL = stdout
    .split('\n')
    .filter((行) => 行.startsWith('Loaded Prisma config') === false)
    .join('\n')
    .trim()
  let 迁移列表 = 读取迁移()
  if (迁移列表.length === 0) throw new Error('未找到 Prisma migration，无法生成浏览器数据库迁移清单')
  let schemaFingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(迁移列表.map((迁移) => [迁移.名称, 迁移.校验和])))
    .update(SQL)
    .digest('hex')

  写入变化文件(
    'src/web/pure-frontend/local-schema.ts',
    [
      '// 该文件由脚本自动生成, 请勿修改.',
      '// 这是供前端 IndexedDB 持久化的 WASM-SQLite 数据库建表使用的 SQL 语句',
      'export let 初始建表SQL = `',
      SQL,
      '`',
      '',
    ].join('\n'),
  )
  写入变化文件(
    'src/types/local-first-database-meta.ts',
    [
      '// 该文件由脚本自动生成, 请勿修改.',
      `export let 本地数据库Schema指纹 = ${JSON.stringify(schemaFingerprint)}`,
      `export let 本地数据库主键表: Record<string, string[]> = ${JSON.stringify(读取主键表(SQL), null, 2)}`,
      `export let 浏览器迁移列表: { 名称: string; 校验和: string; SQL: string }[] = ${JSON.stringify(迁移列表, null, 2)}`,
      '',
    ].join('\n'),
  )
}

try {
  主函数()
} catch (错误) {
  console.error('生成本地数据库元信息失败:', 错误)
  process.exit(1)
}
