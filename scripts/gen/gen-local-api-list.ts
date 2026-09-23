import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

type 浏览器支持 = '纯前端' | '本地优先'
type 浏览器接口 = { 相对路径: string; 路径: string; 方法: string; 浏览器支持: 浏览器支持 }

function 获取目录下所有TS文件(目录: string, 根目录: string = 目录): string[] {
  let 结果: string[] = []
  for (let 文件 of fs.readdirSync(目录)) {
    let 完整路径 = path.join(目录, 文件)
    let 状态 = fs.statSync(完整路径)
    if (状态.isDirectory() === true) 结果 = 结果.concat(获取目录下所有TS文件(完整路径, 根目录))
    else if (状态.isFile() === true && 完整路径.endsWith('.ts') === true && 完整路径.endsWith('.test.ts') === false)
      结果.push(path.relative(根目录, 完整路径).replace(/\\/g, '/').replace(/\.ts$/, ''))
  }
  return 结果
}

function 读取字符串变量(源文件: ts.SourceFile): Map<string, string> {
  let 结果 = new Map<string, string>()
  for (let 语句 of 源文件.statements) {
    if (ts.isVariableStatement(语句) === false) continue
    for (let 声明 of 语句.declarationList.declarations) {
      if (ts.isIdentifier(声明.name) === false || 声明.initializer === undefined) continue
      let 初始值 = ts.isAsExpression(声明.initializer) === true ? 声明.initializer.expression : 声明.initializer
      if (ts.isStringLiteral(初始值) === true) 结果.set(声明.name.text, 初始值.text)
    }
  }
  return 结果
}

function 读取表达式字符串(表达式: ts.Expression, 变量表: Map<string, string>): string | undefined {
  let 内部表达式 = ts.isAsExpression(表达式) === true ? 表达式.expression : 表达式
  if (ts.isStringLiteral(内部表达式) === true) return 内部表达式.text
  if (ts.isIdentifier(内部表达式) === true) return 变量表.get(内部表达式.text)
  return undefined
}

function 读取浏览器接口(文件路径: string, 相对路径: string): 浏览器接口 | undefined {
  let 源文件 = ts.createSourceFile(文件路径, fs.readFileSync(文件路径, 'utf-8'), ts.ScriptTarget.Latest, true)
  let 变量表 = 读取字符串变量(源文件)
  let 结果: 浏览器接口 | undefined
  function 遍历(节点: ts.Node): void {
    if (ts.isExportAssignment(节点) === true && ts.isNewExpression(节点.expression) === true) {
      let 表达式 = 节点.expression
      if (ts.isIdentifier(表达式.expression) === false || 表达式.expression.text !== '接口') return
      let 参数列表 = 表达式.arguments
      if (参数列表 === undefined || 参数列表.length < 5) return
      let 负载 = 参数列表[4]
      let 路径表达式 = 参数列表[0]
      let 方法表达式 = 参数列表[1]
      if (负载 === undefined || 路径表达式 === undefined || 方法表达式 === undefined) return
      if (ts.isObjectLiteralExpression(负载) === false) return
      for (let 属性 of 负载.properties) {
        if (ts.isPropertyAssignment(属性) === false) continue
        let 属性名 = ts.isIdentifier(属性.name) === true || ts.isStringLiteral(属性.name) === true ? 属性.name.text : ''
        if (属性名 !== '浏览器支持' || ts.isStringLiteral(属性.initializer) === false) continue
        let 浏览器支持 = 属性.initializer.text
        if (浏览器支持 !== '纯前端' && 浏览器支持 !== '本地优先') throw new Error(`无效的浏览器支持类型: ${文件路径}`)
        let 路径 = 读取表达式字符串(路径表达式, 变量表)
        let 方法 = 读取表达式字符串(方法表达式, 变量表)
        if (路径 === undefined || 方法 === undefined)
          throw new Error(`浏览器接口必须使用可静态解析的路径和方法: ${文件路径}`)
        结果 = { 相对路径, 路径, 方法, 浏览器支持 }
      }
    }
    ts.forEachChild(节点, 遍历)
  }
  遍历(源文件)
  return 结果
}

function 写入变化文件(目标文件: string, 新内容: string): void {
  let 已有内容 = fs.existsSync(目标文件) === true ? fs.readFileSync(目标文件, 'utf-8') : ''
  if (已有内容 === 新内容) return
  fs.writeFileSync(目标文件, 新内容)
  console.log(`文件 ${目标文件} 已更新。`)
}

function 序列化TS字符串(值: string): string {
  let JSON字符串 = JSON.stringify(值)
  let 内容 = JSON字符串.slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'")
  return `'${内容}'`
}

let 接口目录 = 'src/interface'
let 浏览器接口列表 = 获取目录下所有TS文件(接口目录)
  .map((相对路径) => 读取浏览器接口(path.join(接口目录, `${相对路径}.ts`), 相对路径))
  .filter((接口信息): 接口信息 is 浏览器接口 => 接口信息 !== undefined)
  .sort((左, 右) => 左.相对路径.localeCompare(右.相对路径))

let 导入列表 = 浏览器接口列表.map((接口信息) => {
  let 变量名 = `_src_interface_${接口信息.相对路径.replace(/[^a-zA-Z0-9]/g, '_')}`
  return `import ${变量名} from '../../interface/${接口信息.相对路径}'`
})
let 导出列表 = 浏览器接口列表.map((接口信息) => {
  let 变量名 = `_src_interface_${接口信息.相对路径.replace(/[^a-zA-Z0-9]/g, '_')}`
  return `  { 接口: ${变量名}, 浏览器支持: '${接口信息.浏览器支持}' as const },`
})

写入变化文件(
  'src/web/pure-frontend/local-api-list.ts',
  [
    '// 该文件由脚本自动生成, 请勿修改.',
    '// 包含声明了浏览器支持的接口',
    ...导入列表,
    '',
    'export let 本地接口列表 = [',
    ...导出列表,
    ']',
    '',
  ].join('\n'),
)
写入变化文件(
  'src/web/pure-frontend/local-api-policy.ts',
  [
    '// 该文件由脚本自动生成, 请勿修改.',
    `export let 本地接口策略列表: { 路径: string; 方法: string; 浏览器支持: '纯前端' | '本地优先' }[] = [`,
    ...浏览器接口列表.map(
      (接口信息) =>
        `  { 路径: ${序列化TS字符串(接口信息.路径)}, 方法: ${序列化TS字符串(接口信息.方法)}, 浏览器支持: ${序列化TS字符串(接口信息.浏览器支持)} },`,
    ),
    ']',
    '',
  ].join('\n'),
)
