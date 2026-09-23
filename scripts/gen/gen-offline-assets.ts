import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

let 产物目录 = path.resolve('dist/src/web')
let 清单文件名 = 'offline-assets.json'

function 读取文件列表(目录: string): string[] {
  let 结果: string[] = []
  for (let 项 of fs.readdirSync(目录, { withFileTypes: true })) {
    let 完整路径 = path.join(目录, 项.name)
    if (项.isDirectory() === true) 结果.push(...读取文件列表(完整路径))
    else if (项.isFile() === true && 项.name !== 清单文件名) 结果.push(完整路径)
  }
  return 结果
}

if (fs.existsSync(产物目录) === false) throw new Error(`未找到 Web 构建产物: ${产物目录}`)
let 文件列表 = 读取文件列表(产物目录).sort((左, 右) => 左.localeCompare(右))
let 哈希 = crypto.createHash('sha256')
let assets = 文件列表.map((文件路径) => {
  let 相对路径 = path.relative(产物目录, 文件路径).replaceAll('\\', '/')
  哈希.update(相对路径)
  哈希.update(fs.readFileSync(文件路径))
  return 相对路径
})
let 清单 = { version: 哈希.digest('hex'), assets }
fs.writeFileSync(path.join(产物目录, 清单文件名), JSON.stringify(清单, null, 2))
console.log(`已生成离线资源清单，包含 ${assets.length} 个文件。`)
