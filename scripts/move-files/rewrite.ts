import fs from 'fs'
import path from 'path'
import { Node, Project, SyntaxKind, ts, type SourceFile, type StringLiteral } from 'ts-morph'
import type { 搬移表 } from './plan'

let 可省略后缀列表 = ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.mjs', '.cjs']
let 按路径引用的调用 = new Set([
  'require',
  'vi.mock',
  'vi.doMock',
  'vi.unmock',
  'vi.doUnmock',
  'vi.importActual',
  'vi.importMock',
])

type 解析结果 = {
  目标: string
  写法: { 类型: '照写' } | { 类型: '省略'; 后缀: string } | { 类型: 'js指ts'; 后缀: string }
}

export type 改写报告 = { 改动引用数: number; 警告: string[] }

function 新位置(表: 搬移表, 旧路径: string): string {
  return 表.get(旧路径) ?? 旧路径
}

function 是相对路径(值: string): boolean {
  return 值.startsWith('./') === true || 值.startsWith('../') === true
}

function 按文件系统解析(所在目录: string, 纯路径: string): 解析结果 | null {
  let 基础路径 = path.resolve(所在目录, 纯路径)
  if (fs.existsSync(基础路径) === true && fs.statSync(基础路径).isFile() === true) {
    return { 目标: 基础路径, 写法: { 类型: '照写' } }
  }
  for (let 后缀 of [...可省略后缀列表, ...可省略后缀列表.map((扩展名) => `/index${扩展名}`)]) {
    if (fs.existsSync(基础路径 + 后缀) === true) return { 目标: 基础路径 + 后缀, 写法: { 类型: '省略', 后缀 } }
  }
  let js写法 = /\.(m|c)?js$/u.exec(基础路径)
  if (js写法 !== null) {
    let ts路径 = 基础路径.slice(0, -js写法[0].length) + js写法[0].replace('js', 'ts')
    if (fs.existsSync(ts路径) === true) return { 目标: ts路径, 写法: { 类型: 'js指ts', 后缀: js写法[0] } }
  }
  return null
}

function 解析模块(项目: Project, 文件路径: string, 纯路径: string): 解析结果 | null {
  let 模块 = ts.resolveModuleName(纯路径, 文件路径, 项目.getCompilerOptions(), ts.sys).resolvedModule
  if (模块 === undefined) return 按文件系统解析(path.dirname(文件路径), 纯路径)
  let 目标 = path.resolve(模块.resolvedFileName)
  let 基础路径 = path.resolve(path.dirname(文件路径), 纯路径)
  let js后缀 = /\.(?:m|c)?js$/u.exec(基础路径)
  if (js后缀 !== null && /\.(?:[mc]?ts|tsx)$/u.test(目标)) return { 目标, 写法: { 类型: 'js指ts', 后缀: js后缀[0] } }
  if (目标.startsWith(基础路径) && 目标 !== 基础路径)
    return { 目标, 写法: { 类型: '省略', 后缀: 目标.slice(基础路径.length) } }
  return { 目标, 写法: { 类型: '照写' } }
}

function 是路径引用位置(字面量: StringLiteral): boolean {
  let 父节点 = 字面量.getParent()
  if (Node.isImportDeclaration(父节点) === true || Node.isExportDeclaration(父节点) === true) return true
  if (Node.isLiteralTypeNode(父节点) === true && Node.isImportTypeNode(父节点.getParent()) === true) return true
  if (Node.isCallExpression(父节点) === true) {
    let 第一个参数 = 父节点.getArguments()[0]
    if (第一个参数 !== 字面量) return false
    let 被调用者 = 父节点.getExpression()
    if (被调用者.getKind() === SyntaxKind.ImportKeyword) return true
    return 按路径引用的调用.has(被调用者.getText()) === true
  }
  if (Node.isNewExpression(父节点) === true) {
    let [第一个参数, 第二个参数] = 父节点.getArguments()
    return (
      父节点.getExpression().getText() === 'URL' && 第一个参数 === 字面量 && 第二个参数?.getText() === 'import.meta.url'
    )
  }
  return false
}

function 计算新写法(新所在目录: string, 新目标: string, 写法: 解析结果['写法'], 查询串: string): string {
  let 相对路径 = path.relative(新所在目录, 新目标).split(path.sep).join('/')
  switch (写法.类型) {
    case '照写':
      break
    case '省略':
      相对路径 = 相对路径.slice(0, -写法.后缀.length)
      break
    case 'js指ts':
      相对路径 = 相对路径.replace(/\.(?:[mc]?ts|tsx)$/u, 写法.后缀)
      break
  }
  if (相对路径 === '') 相对路径 = '.'
  if (是相对路径(相对路径) === false && 相对路径 !== '.') 相对路径 = `./${相对路径}`
  return 相对路径 + 查询串
}

/** 在内存里改写所有源码文件中受搬移影响的相对路径引用, 不写盘. */
export function 改写相对引用(项目: Project, 表: 搬移表): 改写报告 {
  let 报告: 改写报告 = { 改动引用数: 0, 警告: [] }
  for (let 文件 of 项目.getSourceFiles()) {
    let 旧文件路径 = path.resolve(文件.getFilePath())
    let 新文件路径 = 新位置(表, 旧文件路径)
    let 文件被搬 = 新文件路径 !== 旧文件路径
    for (let 字面量 of 文件.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
      let 值 = 字面量.getLiteralValue()
      if (是相对路径(值) === false || 是路径引用位置(字面量) === false) continue
      let 查询位置 = 值.search(/[?#]/u)
      let 纯路径 = 查询位置 === -1 ? 值 : 值.slice(0, 查询位置)
      let 查询串 = 查询位置 === -1 ? '' : 值.slice(查询位置)
      let 解析 = 解析模块(项目, 旧文件路径, 纯路径)
      if (解析 === null) {
        if (文件被搬 === true) 报告.警告.push(`${旧文件路径}: 解析不到 '${值}'，没改`)
        continue
      }
      let 新目标 = 新位置(表, 解析.目标)
      if (文件被搬 === false && 新目标 === 解析.目标) continue
      let 新值 = 计算新写法(path.dirname(新文件路径), 新目标, 解析.写法, 查询串)
      if (新值 === 值) continue
      字面量.setLiteralValue(新值)
      报告.改动引用数 += 1
    }
  }
  return 报告
}

function 转义正则(文本: string): string {
  return 文本.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * 文档, 配置和脚本里以项目根目录为起点写的路径 (例如 src/a/b.ts 或省略扩展名的 src/a/b) 按搬移表替换.
 * 前面紧挨路径字符的不算, 以免误改 ../src/a/b 这类相对引用.
 */
export function 创建根路径替换器(项目根目录: string, 表: 搬移表): (文本: string) => string {
  let 替换对 = new Map<string, string>()
  for (let [旧路径, 新路径] of 表) {
    let 旧相对 = path.relative(项目根目录, 旧路径).split(path.sep).join('/')
    let 新相对 = path.relative(项目根目录, 新路径).split(path.sep).join('/')
    替换对.set(旧相对, 新相对)
    let 扩展名 = path.extname(旧相对)
    if (可省略后缀列表.includes(扩展名) === true && path.extname(新相对) === 扩展名) {
      替换对.set(旧相对.slice(0, -扩展名.length), 新相对.slice(0, -扩展名.length))
    }
  }
  if (替换对.size === 0) return (文本) => 文本
  let 候选 = [...替换对.keys()].sort((甲, 乙) => 乙.length - 甲.length).map(转义正则)
  let 匹配 = new RegExp(`(?<![\\p{L}\\p{N}_\\-./])(?:${候选.join('|')})(?![\\p{L}\\p{N}_\\-/]|\\.[\\p{L}\\p{N}])`, 'gu')
  return (文本) => 文本.replace(匹配, (命中) => 替换对.get(命中) ?? 命中)
}

/** 文档等非源码文件里的相对路径 (例如 Markdown 链接 ../../src/a/b.ts) 按文件所在位置解析, 指向被搬文件或文档自己被搬时改写. */
export function 改写文档相对路径(文本: string, 旧文件路径: string, 表: 搬移表): string {
  let 新文件路径 = 新位置(表, 旧文件路径)
  let 文件被搬 = 新文件路径 !== 旧文件路径
  return 文本.replace(/(?<![\p{L}\p{N}_\-./])\.\.?\/[^\s()'"`<>[\]#?]+/gu, (相对路径) => {
    let 目标 = path.resolve(path.dirname(旧文件路径), 相对路径)
    let 新目标 = 新位置(表, 目标)
    if (新目标 === 目标 && (文件被搬 === false || fs.existsSync(目标) === false)) return 相对路径
    let 新相对 = path.relative(path.dirname(新文件路径), 新目标).split(path.sep).join('/')
    return 是相对路径(新相对) === true ? 新相对 : `./${新相对}`
  })
}

export function 源码文件表(项目: Project): Map<string, SourceFile> {
  return new Map(项目.getSourceFiles().map((文件) => [path.resolve(文件.getFilePath()), 文件]))
}
