import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'

let { values } = parseArgs({ options: { 'other-root': { type: 'string' } } })
let 本仓库 = path.resolve(import.meta.dirname, '../..')
let 对方仓库 = z.string().min(1).refine(path.isAbsolute, '--other-root 必须是绝对路径').parse(values['other-root'])
let 清单路径 = 'doc/framework/mobile-testing-shared-files.json'
let 文件们 = z
  .array(z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9./-]+$/u))
  .min(1)
  .parse(JSON.parse(await readFile(path.join(本仓库, 清单路径), 'utf8')))
let 差异们: string[] = []
for (let 文件 of 文件们) {
  try {
    let 内容们 = await Promise.all(
      [本仓库, 对方仓库].map(async (目录): Promise<Buffer> => await readFile(path.join(目录, 文件))),
    )
    let 摘要们 = 内容们.map((内容) => createHash('sha256').update(内容).digest('hex'))
    if (摘要们[0] !== 摘要们[1]) 差异们.push(文件)
  } catch (错误) {
    throw new Error(`读取共有文件失败：${文件}`, { cause: 错误 })
  }
}
if (差异们.length > 0) throw new Error(`移动测试共有文件内容不同：\n${差异们.join('\n')}`)
console.log(`移动测试共有文件 ${String(文件们.length)} 个，路径和 SHA-256 全部一致`)
