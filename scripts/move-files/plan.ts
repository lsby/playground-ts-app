import fs from 'fs'
import path from 'path'
import { z } from 'zod'

export type 搬移表 = Map<string, string>

let 搬移计划Schema = z.array(z.tuple([z.string().min(1), z.string().min(1)]))

export function 校验项目内路径(项目根目录: string, 文件路径: string): void {
  let 相对路径 = path.relative(项目根目录, 文件路径)
  if (相对路径 === '' || 相对路径 === '..' || 相对路径.startsWith(`..${path.sep}`) || path.isAbsolute(相对路径))
    throw new Error(`搬移路径必须在项目目录内：${文件路径}`)
  let 已存在路径 = 文件路径
  while (fs.existsSync(已存在路径) === false) 已存在路径 = path.dirname(已存在路径)
  let 实际相对路径 = path.relative(fs.realpathSync(项目根目录), fs.realpathSync(已存在路径))
  if (实际相对路径 === '..' || 实际相对路径.startsWith(`..${path.sep}`) || path.isAbsolute(实际相对路径))
    throw new Error(`搬移路径通过链接指向项目外：${文件路径}`)
}

function 列出目录下文件(目录: string): string[] {
  let 结果: string[] = []
  for (let 项 of fs.readdirSync(目录, { withFileTypes: true })) {
    let 完整路径 = path.join(目录, 项.name)
    if (项.isSymbolicLink() === true) throw new Error(`搬移不支持符号链接：${完整路径}`)
    if (项.isDirectory() === true) {
      if (项.name === 'node_modules' || 项.name === '.git') continue
      结果.push(...列出目录下文件(完整路径))
      continue
    }
    结果.push(完整路径)
  }
  return 结果
}

function 展开来源(项目根目录: string, 来源: string): string[] {
  let 有通配符 = /[*?[\]{}]/u.test(来源)
  if (有通配符 === true) {
    let 匹配 = fs.globSync(来源, { cwd: 项目根目录 }).map((相对路径) => path.resolve(项目根目录, 相对路径))
    if (匹配.length === 0) throw new Error(`没有文件匹配：${来源}`)
    return 匹配
  }
  let 绝对路径 = path.resolve(项目根目录, 来源)
  if (fs.existsSync(绝对路径) === false) throw new Error(`来源不存在：${来源}`)
  return [绝对路径]
}

function 加入一条(表: 搬移表, 旧路径: string, 新路径: string): void {
  if (旧路径 === 新路径) return
  let 已有 = 表.get(旧路径)
  if (已有 !== undefined && 已有 !== 新路径) throw new Error(`同一个文件被搬到两个地方：${旧路径}`)
  表.set(旧路径, 新路径)
}

/**
 * 一条规则按 mv 的语义展开成逐文件的搬移表:
 * 目标以 / 结尾、是已有目录或来源有多个时, 来源放进目标目录; 否则视为改名.
 * 来源是目录时整个目录连同子目录一起搬.
 */
function 展开规则(项目根目录: string, 表: 搬移表, 来源: string, 目标: string, 多来源 = false): void {
  let 来源列表 = 展开来源(项目根目录, 来源)
  let 目标绝对路径 = path.resolve(项目根目录, 目标)
  let 目标已是目录 = fs.existsSync(目标绝对路径) === true && fs.statSync(目标绝对路径).isDirectory() === true
  let 放进目录 =
    目标.endsWith('/') === true ||
    目标.endsWith(path.sep) === true ||
    目标已是目录 === true ||
    来源列表.length > 1 ||
    多来源
  for (let 来源路径 of 来源列表) {
    let 去处 = 放进目录 === true ? path.join(目标绝对路径, path.basename(来源路径)) : 目标绝对路径
    校验项目内路径(项目根目录, 来源路径)
    校验项目内路径(项目根目录, 去处)
    if (fs.lstatSync(来源路径).isSymbolicLink() === true) throw new Error(`搬移不支持符号链接：${来源路径}`)
    let 目标相对来源 = path.relative(来源路径, 去处)
    if (
      fs.statSync(来源路径).isDirectory() === true &&
      目标相对来源 !== '' &&
      目标相对来源.startsWith('..') === false &&
      path.isAbsolute(目标相对来源) === false
    )
      throw new Error(`不能把目录搬进自身：${来源路径}`)
    if (fs.statSync(来源路径).isDirectory() === true) {
      for (let 文件 of 列出目录下文件(来源路径)) 加入一条(表, 文件, path.join(去处, path.relative(来源路径, 文件)))
      continue
    }
    加入一条(表, 来源路径, 去处)
  }
}

function 校验搬移表(表: 搬移表): void {
  let 去处集合 = new Set<string>()
  for (let 去处 of 表.values()) {
    let 比较路径 = process.platform === 'win32' ? 去处.toLowerCase() : 去处
    if (去处集合.has(比较路径) === true) throw new Error(`多个文件被搬到同一个位置：${去处}`)
    for (let 已有 of 去处集合)
      if (比较路径.startsWith(`${已有}${path.sep}`) || 已有.startsWith(`${比较路径}${path.sep}`))
        throw new Error(`目标路径互相包含：${去处}`)
    去处集合.add(比较路径)
    if (fs.existsSync(去处) === true) throw new Error(`目标位置已有文件：${去处}`)
    let 父目录 = path.dirname(去处)
    while (fs.existsSync(父目录) === false) 父目录 = path.dirname(父目录)
    if (fs.statSync(父目录).isDirectory() === false) throw new Error(`目标父路径不是目录：${父目录}`)
  }
}

export function 由命令行生成搬移表(项目根目录: string, 参数: string[]): 搬移表 {
  let 目标 = 参数.at(-1)
  let 来源列表 = 参数.slice(0, -1)
  if (目标 === undefined || 来源列表.length === 0) throw new Error('用法：<来源...> <目标>')
  let 表: 搬移表 = new Map()
  for (let 来源 of 来源列表) 展开规则(项目根目录, 表, 来源, 目标, 来源列表.length > 1)
  校验搬移表(表)
  return 表
}

export function 由计划文件生成搬移表(项目根目录: string, 计划文件: string): 搬移表 {
  let 规则列表 = 搬移计划Schema.parse(JSON.parse(fs.readFileSync(path.resolve(项目根目录, 计划文件), 'utf8')))
  let 表: 搬移表 = new Map()
  for (let [来源, 目标] of 规则列表) 展开规则(项目根目录, 表, 来源, 目标)
  校验搬移表(表)
  return 表
}

/**
 * 按文件名前缀给一个平铺目录生成搬移计划草稿, 只输出不执行.
 * 前缀取去掉 去掉前缀 之后的第一个短横线分段, 同前缀文件数达到 最少文件数 才单独成组.
 */
export function 按前缀生成计划(
  项目根目录: string,
  目录: string,
  去掉前缀: string,
  最少文件数: number,
): [string, string][] {
  let 目录绝对路径 = path.resolve(项目根目录, 目录)
  校验项目内路径(项目根目录, 目录绝对路径)
  let 分组 = new Map<string, string[]>()
  for (let 项 of fs.readdirSync(目录绝对路径, { withFileTypes: true })) {
    if (项.isFile() === false) continue
    let 名称 = 项.name.startsWith(去掉前缀) === true ? 项.name.slice(去掉前缀.length) : 项.name
    let 前缀 = 名称.split(/[-.]/u)[0]
    if (前缀 === undefined || 前缀 === '' || 前缀 === 'index') continue
    let 组 = 分组.get(前缀) ?? []
    组.push(项.name)
    分组.set(前缀, 组)
  }
  let 计划: [string, string][] = []
  let 相对目录 = path.relative(项目根目录, 目录绝对路径)
  for (let [前缀, 文件列表] of [...分组.entries()].sort((甲, 乙) => 乙[1].length - 甲[1].length)) {
    if (文件列表.length < 最少文件数) continue
    for (let 文件 of 文件列表.sort()) 计划.push([`${相对目录}/${文件}`, `${相对目录}/${前缀}/`])
  }
  return 计划
}
