import fs from 'fs'
import path from 'path'

let Web产物目录 = path.resolve(import.meta.dirname, '../../dist/src/web')
if (fs.existsSync(Web产物目录) === false) throw new Error('缺少 Android Web 构建产物')
let Worker文件 = fs.readdirSync(Web产物目录).filter((名称) => /^pure-frontend-api-worker\.[a-f0-9]{8}\.js$/u.test(名称))
if (
  Worker文件.length === 0 ||
  Worker文件.some((名称) => {
    let 状态 = fs.statSync(path.join(Web产物目录, 名称))
    return 状态.isFile() === false || 状态.size === 0
  })
)
  throw new Error('Android Web 资源缺少纯前端 Worker，请先完成纯前端 Web 构建')
console.log('Android Web 资源检查通过')
