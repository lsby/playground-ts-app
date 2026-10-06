import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { 加密环境文本, 发现正式环境文件, 生成项目密钥, 解密环境文本, 读取环境文件明文 } from './env-crypto-core.mjs'

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 操作 = z.enum(['decode', 'encode', 'enable', 'disable', 'status']).parse(process.argv[2])
let 强制覆盖 = process.argv.includes('--force')

function 原子写入(文件路径: string, 内容: string): void {
  let 临时路径 = `${文件路径}.${process.pid.toString()}.tmp`
  fs.writeFileSync(临时路径, 内容, 'utf8')
  fs.renameSync(临时路径, 文件路径)
}

function 发现解码文件(): string[] {
  let 环境目录 = path.resolve(项目根目录, '.env')
  return fs
    .readdirSync(环境目录, { withFileTypes: true })
    .filter(
      (项) => 项.isFile() === true && 项.name.startsWith('.env.') === true && 项.name.endsWith('.decode') === true,
    )
    .map((项) => path.resolve(环境目录, 项.name))
    .sort((左, 右) => 左.localeCompare(右))
}

function 执行解码(): void {
  let 文件组 = 发现正式环境文件(项目根目录)
  let 待写入组 = 文件组.map((相对路径) => {
    let 源路径 = path.resolve(项目根目录, 相对路径)
    let 解码路径 = `${源路径}.decode`
    if (fs.existsSync(解码路径) === true && 强制覆盖 === false) {
      throw new Error(`解码文件已存在，为避免覆盖未编码的修改已中止: ${path.relative(项目根目录, 解码路径)}`)
    }
    return { 解码路径, 内容: 读取环境文件明文(项目根目录, 源路径) }
  })
  for (let 文件 of 待写入组) {
    原子写入(文件.解码路径, 文件.内容)
    console.log(`已生成: ${path.relative(项目根目录, 文件.解码路径)}`)
  }
}

function 执行编码(): void {
  let 解码文件组 = 发现解码文件()
  if (解码文件组.length === 0) throw new Error('没有找到待编码的 .decode 文件')
  let 待写入组 = 解码文件组.map((解码路径) => {
    let 源路径 = 解码路径.slice(0, -'.decode'.length)
    let 相对路径 = path.relative(项目根目录, 源路径)
    if (fs.existsSync(源路径) === false) throw new Error(`解码文件缺少对应的正式环境文件: ${相对路径}`)
    let 明文内容 = fs.readFileSync(解码路径, 'utf8')
    let 现有内容 = fs.readFileSync(源路径, 'utf8')
    let 加密内容 = 加密环境文本({ 项目根目录, 文件路径: 源路径, 明文内容, 现有加密内容: 现有内容 })
    let 验证明文 = 解密环境文本({ 项目根目录, 文件路径: 源路径, 加密内容 })
    if (验证明文.replaceAll('\r\n', '\n') !== 明文内容.replaceAll('\r\n', '\n')) {
      throw new Error(`环境文件加密往返校验失败: ${相对路径}`)
    }
    return { 源路径, 解码路径, 加密内容 }
  })
  for (let 文件 of 待写入组) 原子写入(文件.源路径, 文件.加密内容)
  for (let 文件 of 待写入组) {
    fs.unlinkSync(文件.解码路径)
    console.log(`已编码并清理: ${path.relative(项目根目录, 文件.解码路径)}`)
  }
}

function 执行启用加密(): void {
  生成项目密钥(项目根目录)
  let 待写入组 = 发现正式环境文件(项目根目录).map((相对路径) => {
    let 文件路径 = path.resolve(项目根目录, 相对路径)
    let 现有加密内容 = fs.readFileSync(文件路径, 'utf8')
    let 明文内容 = 读取环境文件明文(项目根目录, 文件路径)
    let 加密内容 = 加密环境文本({ 项目根目录, 文件路径, 明文内容, 现有加密内容 })
    return { 文件路径, 加密内容 }
  })
  for (let 文件 of 待写入组) 原子写入(文件.文件路径, 文件.加密内容)
  console.log(`已启用加密，密钥位于 ${path.resolve(项目根目录, '.project-config.key')}`)
}

function 执行停用加密(): void {
  let 待写入组 = 发现正式环境文件(项目根目录).map((相对路径) => {
    let 文件路径 = path.resolve(项目根目录, 相对路径)
    return { 文件路径, 明文内容: 读取环境文件明文(项目根目录, 文件路径) }
  })
  for (let 文件 of 待写入组) 原子写入(文件.文件路径, 文件.明文内容)
  console.log('已停用加密；项目密钥仍保留在本地，如确认不再需要可手工删除')
}

function 执行状态检查(): void {
  for (let 相对路径 of 发现正式环境文件(项目根目录)) {
    let 文件路径 = path.resolve(项目根目录, 相对路径)
    let 是否存在解码文件 = fs.existsSync(`${文件路径}.decode`)
    let 首行 = fs.readFileSync(文件路径, 'utf8').split(/\r?\n/u)[0]
    console.log(`${相对路径}: ${首行 ?? '缺少加密开关'}${是否存在解码文件 ? '，存在待编码 .decode' : ''}`)
  }
}

switch (操作) {
  case 'decode':
    执行解码()
    break
  case 'encode':
    执行编码()
    break
  case 'enable':
    执行启用加密()
    break
  case 'disable':
    执行停用加密()
    break
  case 'status':
    执行状态检查()
    break
}
