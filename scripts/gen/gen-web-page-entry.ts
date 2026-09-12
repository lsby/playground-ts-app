import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

type 组件注册信息 = { 组件名称: string; 文件路径: string }

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 组件目录 = path.join(项目根目录, 'src/web/components')
let 页面目录 = path.join(项目根目录, 'src/web/page')
let 入口目录 = path.join(页面目录, 'entry')
let 生成声明 = '// 该文件由脚本自动生成, 请勿修改.'

function 获取目录内所有文件(目录: string, 后缀: string): string[] {
  let 结果: string[] = []
  for (let 文件名称 of fs.readdirSync(目录)) {
    let 完整路径 = path.join(目录, 文件名称)
    let 状态 = fs.statSync(完整路径)
    if (状态.isDirectory() === true) {
      结果.push(...获取目录内所有文件(完整路径, 后缀))
    } else if (状态.isFile() === true && 完整路径.endsWith(后缀) === true) {
      结果.push(完整路径)
    }
  }
  return 结果.sort()
}

function 获取文件组件注册信息(文件路径: string): 组件注册信息[] {
  let 源码 = fs.readFileSync(文件路径, 'utf-8')
  let 源文件 = ts.createSourceFile(文件路径, 源码, ts.ScriptTarget.Latest, true)
  let 结果: 组件注册信息[] = []

  function 遍历(节点: ts.Node): void {
    if (
      ts.isCallExpression(节点) === true &&
      ts.isPropertyAccessExpression(节点.expression) === true &&
      节点.expression.name.text === '注册组件'
    ) {
      let 组件名称参数 = 节点.arguments[0]
      if (组件名称参数 === undefined || ts.isStringLiteral(组件名称参数) === false) {
        throw new Error(`文件 ${path.relative(项目根目录, 文件路径)} 的注册组件调用必须使用字符串字面量名称`)
      }
      if (组件名称参数.text.includes('-') === false || 组件名称参数.text !== 组件名称参数.text.toLowerCase()) {
        throw new Error(
          `文件 ${path.relative(项目根目录, 文件路径)} 的组件名称 ${组件名称参数.text} 必须包含连字符并使用小写`,
        )
      }
      结果.push({ 组件名称: 组件名称参数.text, 文件路径 })
    }
    ts.forEachChild(节点, 遍历)
  }

  遍历(源文件)
  return 结果
}

function 获取组件注册表(): Map<string, string> {
  let 注册表 = new Map<string, string>()
  let 组件文件列表 = 获取目录内所有文件(组件目录, '.ts')
  for (let 文件路径 of 组件文件列表) {
    for (let 注册信息 of 获取文件组件注册信息(文件路径)) {
      let 已有文件 = 注册表.get(注册信息.组件名称)
      if (已有文件 !== undefined) {
        throw new Error(
          `组件 ${注册信息.组件名称} 在 ${path.relative(项目根目录, 已有文件)} 和 ${path.relative(
            项目根目录,
            注册信息.文件路径,
          )} 中重复注册`,
        )
      }
      注册表.set(注册信息.组件名称, 注册信息.文件路径)
    }
  }
  return 注册表
}

function 获取页面组件名称(页面文件: string): string[] {
  let 页面内容 = fs.readFileSync(页面文件, 'utf-8').replace(/<!--[\s\S]*?-->/g, '')
  let 组件名称集合 = new Set<string>()
  let 匹配模式 = /<([^\s/>]+)(?=[\s/>])/g
  for (let 匹配项 of 页面内容.matchAll(匹配模式)) {
    let 组件名称 = 匹配项[1]
    if (组件名称 !== undefined && 组件名称.includes('-') === true) {
      组件名称集合.add(组件名称.toLowerCase())
    }
  }
  return [...组件名称集合].sort()
}

function 转换为导入路径(入口文件: string, 组件文件: string): string {
  let 无后缀路径 = 组件文件.replace(/\.ts$/, '')
  let 相对路径 = path.relative(path.dirname(入口文件), 无后缀路径).replace(/\\/g, '/')
  return 相对路径.startsWith('.') === true ? 相对路径 : `./${相对路径}`
}

function 获取页面入口文件(页面文件: string): string {
  let 页面相对路径 = path.relative(页面目录, 页面文件).replace(/\.html$/, '.ts')
  return path.join(入口目录, 页面相对路径)
}

function 检查页面入口引用(页面文件: string, 入口文件: string): void {
  let 页面内容 = fs.readFileSync(页面文件, 'utf-8')
  let 相对入口 = path.relative(path.dirname(页面文件), 入口文件).replace(/\\/g, '/')
  if (相对入口.startsWith('.') === false) 相对入口 = `./${相对入口}`
  let 找到入口 = false
  for (let 脚本标签匹配 of 页面内容.matchAll(/<script\b[^>]*>/gi)) {
    let 脚本标签 = 脚本标签匹配[0]
    let 源路径匹配 = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(脚本标签)
    let 类型匹配 = /\btype\s*=\s*["']([^"']+)["']/i.exec(脚本标签)
    if (源路径匹配?.[1] === 相对入口 && 类型匹配?.[1]?.toLowerCase() === 'module') {
      找到入口 = true
      break
    }
  }
  if (找到入口 === false) {
    throw new Error(
      `页面 ${path.relative(项目根目录, 页面文件)} 必须引用自动生成入口: <script src="${相对入口}" type="module"></script>`,
    )
  }
}

function 写入变化文件(文件路径: string, 内容: string): void {
  let 已有内容 = fs.existsSync(文件路径) === true ? fs.readFileSync(文件路径, 'utf-8') : ''
  if (已有内容 === 内容) return
  fs.mkdirSync(path.dirname(文件路径), { recursive: true })
  fs.writeFileSync(文件路径, 内容)
  console.log(`文件 ${path.relative(项目根目录, 文件路径)} 已更新。`)
}

function 删除失效入口(有效入口: Set<string>): void {
  if (fs.existsSync(入口目录) === false) return
  for (let 入口文件 of 获取目录内所有文件(入口目录, '.ts')) {
    if (有效入口.has(入口文件) === true) continue
    let 内容 = fs.readFileSync(入口文件, 'utf-8')
    if (内容.startsWith(生成声明) === false) continue
    fs.unlinkSync(入口文件)
    console.log(`失效入口 ${path.relative(项目根目录, 入口文件)} 已删除。`)
  }
}

let 组件注册表 = 获取组件注册表()
let 页面文件列表 = 获取目录内所有文件(页面目录, '.html')
let 有效入口 = new Set<string>()

for (let 页面文件 of 页面文件列表) {
  let 入口文件 = 获取页面入口文件(页面文件)
  let 导入路径集合 = new Set<string>()
  for (let 组件名称 of 获取页面组件名称(页面文件)) {
    let 组件文件 = 组件注册表.get(组件名称)
    if (组件文件 === undefined) {
      throw new Error(`页面 ${path.relative(项目根目录, 页面文件)} 使用了未注册组件 ${组件名称}`)
    }
    导入路径集合.add(转换为导入路径(入口文件, 组件文件))
  }
  检查页面入口引用(页面文件, 入口文件)
  let 导入代码 = [...导入路径集合].sort().map((导入路径) => `import '${导入路径}'`)
  let 新内容 = [生成声明, ...导入代码, ''].join('\n')
  写入变化文件(入口文件, 新内容)
  有效入口.add(入口文件)
}

删除失效入口(有效入口)
