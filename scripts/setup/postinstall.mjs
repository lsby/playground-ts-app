import fs from 'node:fs'
import path from 'node:path'
import { 执行开发数据库初始化 } from './init-dev-database.mjs'

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 状态路径 = path.resolve(项目根目录, '.setup-state.json')

function 读取原始状态() {
  if (fs.existsSync(状态路径) === false) return null
  try {
    let 状态 = JSON.parse(fs.readFileSync(状态路径, 'utf8'))
    return typeof 状态 === 'object' && 状态 !== null ? 状态 : null
  } catch (错误) {
    console.log(`[跳过] 无法读取 .setup-state.json：${String(错误)}`)
    return null
  }
}

let 状态 = 读取原始状态()
if (状态?.devDatabaseInitializationPending === true) {
  执行开发数据库初始化(项目根目录)
  状态.devDatabaseInitializationPending = false
  fs.writeFileSync(状态路径, `${JSON.stringify(状态, null, 2)}\n`)
}
