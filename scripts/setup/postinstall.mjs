import fs from 'node:fs'
import path from 'node:path'
import { 执行开发数据库初始化 } from './init-dev-database.mjs'
import { 读取初始化状态文件 } from './init-ports-core.mjs'

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 状态路径 = path.resolve(项目根目录, '.setup-state.json')

let 状态 = 读取初始化状态文件(项目根目录)
if (状态?.devDatabaseInitializationPending === true) {
  执行开发数据库初始化(项目根目录)
  状态.devDatabaseInitializationPending = false
  fs.writeFileSync(状态路径, `${JSON.stringify(状态, null, 2)}\n`)
}
