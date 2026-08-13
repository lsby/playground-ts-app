import { execSync } from 'child_process'
import * as fs from 'fs'

try {
  let stdout = execSync(
    'npx dotenv -e ./.env/.env.development.web -- prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script',
    { encoding: 'utf-8' },
  )

  // 过滤掉第一行可能的 'Loaded Prisma config from prisma.config.ts.' 等干扰输出
  let sql = stdout
    .split('\n')
    .filter((line) => !line.startsWith('Loaded Prisma config'))
    .join('\n')
    .trim()

  let 目标文件 = 'src/web/local-schema.ts'

  let 新内容 = [
    `// 该文件由脚本自动生成, 请勿修改.`,
    `// 这是供前端 IndexedDB 持久化的 WASM-SQLite 数据库建表使用的 SQL 语句`,
    `export let 初始建表SQL = \``,
    sql,
    `\``,
    '',
  ].join('\n')

  let 已有内容 = ''
  try {
    已有内容 = fs.readFileSync(目标文件, 'utf-8')
  } catch (_错误) {}

  if (已有内容 !== 新内容) {
    fs.writeFileSync(目标文件, 新内容)
    console.log(`文件 ${目标文件} 已更新。`)
  } else {
    console.log(`文件 ${目标文件} 内容未变化，跳过写入。`)
  }
} catch (e) {
  console.error('获取 schema SQL 失败:', e)
  process.exit(1)
}
