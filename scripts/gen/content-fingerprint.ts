import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

export function 收集目录文件(目录: string): string[] {
  if (fs.existsSync(目录) === false) return []
  let 结果: string[] = []
  let 访问过 = new Set<string>()
  let 收集 = (当前: string): void => {
    let 实际目录 = fs.realpathSync(当前)
    if (访问过.has(实际目录)) return
    访问过.add(实际目录)
    for (let 项 of fs.readdirSync(当前, { withFileTypes: true })) {
      let 文件 = path.join(当前, 项.name)
      let 状态 = fs.statSync(文件)
      if (状态.isDirectory()) 收集(文件)
      else if (状态.isFile()) 结果.push(文件)
    }
  }
  收集(目录)
  return 结果.sort()
}

export function 计算文件指纹(根目录: string, 文件们: readonly string[], 附加内容 = ''): string {
  let 哈希 = createHash('sha256').update(附加内容).update('\0')
  for (let 文件 of [...new Set(文件们)].sort()) {
    哈希.update(path.relative(根目录, 文件).replaceAll('\\', '/')).update('\0')
    哈希.update(fs.readFileSync(文件)).update('\0')
  }
  return 哈希.digest('hex')
}

let 缓存模型 = z.object({ 版本: z.literal(1), 输入: z.string(), 输出: z.string() }).strict()

export function 读取有效缓存(文件: string): z.infer<typeof 缓存模型> | null {
  let 内容: string
  try {
    内容 = fs.readFileSync(文件, 'utf8')
  } catch (错误) {
    if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'ENOENT') return null
    throw 错误
  }
  try {
    let 解析 = 缓存模型.safeParse(JSON.parse(内容))
    return 解析.success ? 解析.data : null
  } catch (错误) {
    if (错误 instanceof SyntaxError) return null
    throw 错误
  }
}

export function 写入缓存(文件: string, 输入: string, 输出: string): void {
  fs.mkdirSync(path.dirname(文件), { recursive: true })
  let 临时文件 = `${文件}.${String(process.pid)}.tmp`
  fs.writeFileSync(临时文件, JSON.stringify({ 版本: 1, 输入, 输出 }))
  fs.renameSync(临时文件, 文件)
}
