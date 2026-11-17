import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

let 项目源码们 = new Map<string, Map<string, string>>()

/** Node 会缓存已导入的流程及其辅助模块；修改后必须换进程，不能继续使用旧对象。 */
export async function 检查需求源码版本(根目录: string): Promise<void> {
  let 已加载文件们 = 项目源码们.get(根目录) ?? new Map<string, string>()
  let 当前文件们 = new Map<string, string>()
  for (let 相对目录 of ['test/requirement', 'test/requirement-support']) {
    let 目录 = path.join(根目录, 相对目录)
    let 条目们
    try {
      条目们 = await readdir(目录, { recursive: true, withFileTypes: true })
    } catch (错误) {
      if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'ENOENT') continue
      throw 错误
    }
    for (let 项 of 条目们) {
      if (项.isFile() === false || /\.[cm]?tsx?$/u.test(项.name) === false) continue
      let 文件 = path.join(项.parentPath, 项.name)
      当前文件们.set(
        文件,
        createHash('sha256')
          .update(await readFile(文件))
          .digest('hex'),
      )
    }
  }
  for (let [文件, 哈希] of 已加载文件们) {
    if (当前文件们.get(文件) !== 哈希)
      throw new Error(
        `需求测试源码已修改，当前进程仍缓存旧模块，请重启测试进程或开发套件：${path.relative(根目录, 文件)}`,
      )
  }
  // 新增导出文件可以继续发现；已经加载过的文件一旦修改则拒绝继续。
  for (let [文件, 哈希] of 当前文件们) 已加载文件们.set(文件, 哈希)
  项目源码们.set(根目录, 已加载文件们)
}
