import fs from 'fs'
import path from 'path'

let Worker路径 = path.resolve(import.meta.dirname, '../../dist/src/web/worker-assets/pure-frontend-api-worker.js')

if (
  fs.existsSync(Worker路径) === false ||
  fs.statSync(Worker路径).isFile() === false ||
  fs.statSync(Worker路径).size === 0
)
  throw new Error(`Android Web 资源缺少纯前端 Worker，请先完成 Web 构建：${Worker路径}`)

console.log(`Android Web 资源检查通过：${Worker路径}`)
