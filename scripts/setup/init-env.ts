import fs from 'fs'
import path from 'path'
import { 发现环境文件, 获得环境文件 } from './env-files-core.mjs'
import { 应用端口表, 读取端口状态 } from './init-ports-core.mjs'

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 强制覆盖 = process.argv.includes('--force')

function 从示例创建本地文件(示例路径: string, 本地路径: string): void {
  let 示例绝对路径 = path.join(项目根目录, 示例路径)
  let 本地绝对路径 = path.join(项目根目录, 本地路径)
  if (fs.existsSync(示例绝对路径) === false) throw new Error(`缺少配置示例: ${示例路径}`)
  if (fs.existsSync(本地绝对路径) === true && 强制覆盖 === false) {
    console.log(`已存在，跳过: ${本地路径}`)
    return
  }
  fs.mkdirSync(path.dirname(本地绝对路径), { recursive: true })
  fs.copyFileSync(示例绝对路径, 本地绝对路径)
  console.log(`已创建: ${本地路径}`)
}

let 本地环境文件组: string[] = []
for (let 环境文件 of 发现环境文件(项目根目录)) {
  let 本地文件 = 获得环境文件(项目根目录, 环境文件)
  本地环境文件组.push(本地文件)
  从示例创建本地文件(环境文件.示例文件, 本地文件)
}
从示例创建本地文件('deploy/servers.example.json', 'deploy/servers.local.json')
let 已保存端口表 = 读取端口状态(项目根目录)
if (已保存端口表 !== null) {
  应用端口表(项目根目录, 本地环境文件组, 已保存端口表)
  console.log('已恢复 .setup-state.json 中保存的端口配置')
}

console.log(强制覆盖 === true ? '本地配置已强制刷新' : '本地配置初始化完成；已有配置均已保留')
