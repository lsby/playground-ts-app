import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** 摘要覆盖主程序、网页资源和配置，构建时写入，运行时核对装到模拟器的包与当前构建一致。 */
export function 计算苹果应用摘要(应用路径: string, 相对路径们: readonly string[]): string {
  let 摘要 = createHash('sha256')
  let 文件们: string[] = []
  let 收集 = (目录: string): void => {
    for (let 项 of fs.readdirSync(目录, { withFileTypes: true }).sort((甲, 乙) => 甲.name.localeCompare(乙.name))) {
      let 路径 = path.join(目录, 项.name)
      if (项.isDirectory()) 收集(路径)
      else if (项.isFile()) 文件们.push(路径)
    }
  }
  for (let 相对路径 of 相对路径们) {
    let 目标 = path.resolve(应用路径, 相对路径)
    let 相对 = path.relative(应用路径, 目标)
    if (相对.startsWith('..') || path.isAbsolute(相对)) throw new Error('摘要路径必须位于应用目录内')
    if (fs.statSync(目标).isDirectory()) 收集(目标)
    else 文件们.push(目标)
  }
  for (let 文件 of 文件们) 摘要.update(path.relative(应用路径, 文件)).update(fs.readFileSync(文件))
  return 摘要.digest('hex')
}
