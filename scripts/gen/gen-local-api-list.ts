import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

function 获取目录下所有TS文件(目录: string, 根目录: string = 目录): string[] {
  let 结果: string[] = []

  let 列表 = fs.readdirSync(目录)
  for (let 文件 of 列表) {
    let 完整路径 = path.join(目录, 文件)
    let 状态 = fs.statSync(完整路径)

    if (状态.isDirectory() === true) {
      结果 = 结果.concat(获取目录下所有TS文件(完整路径, 根目录))
    } else if (状态.isFile() === true && 完整路径.endsWith('.ts') === true && 完整路径.endsWith('.test.ts') === false) {
      let 相对路径 = path.relative(根目录, 完整路径).replace(/\\/g, '/').replace(/\.ts$/, '')
      结果.push(相对路径)
    }
  }

  return 结果
}

function 检查是否支持纯前端(文件路径: string): boolean {
  if (fs.existsSync(文件路径) === false) return false
  let 源码 = fs.readFileSync(文件路径, 'utf-8')
  let 源文件 = ts.createSourceFile(文件路径, 源码, ts.ScriptTarget.Latest, true)
  let 是否支持 = false

  function 遍历(节点: ts.Node): void {
    if (ts.isExportAssignment(节点) === true) {
      let 表达式 = 节点.expression
      if (ts.isNewExpression(表达式) === true && ts.isIdentifier(表达式.expression) === true) {
        if (表达式.expression.text === '接口') {
          let 参数列表 = 表达式.arguments
          if (参数列表 !== undefined && 参数列表.length >= 5) {
            let 负载对象 = 参数列表[4]
            if (负载对象 !== undefined && ts.isObjectLiteralExpression(负载对象 as ts.Node) === true) {
              for (let 属性 of (负载对象 as ts.ObjectLiteralExpression).properties) {
                if (ts.isPropertyAssignment(属性) === true) {
                  let 属性名 = 属性.name
                  if (ts.isIdentifier(属性名) === true && 属性名.text === '支持纯前端模式') {
                    let 属性值 = 属性.initializer
                    if (属性值.kind === ts.SyntaxKind.TrueKeyword) {
                      是否支持 = true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(节点, 遍历)
  }

  遍历(源文件)
  return 是否支持
}

let 接口目录 = 'src/interface'
let 所有文件相对路径 = 获取目录下所有TS文件(接口目录)

let 支持纯前端的接口 = 所有文件相对路径
  .filter((相对路径) => {
    let 绝对路径 = path.join(接口目录, 相对路径 + '.ts')
    return 检查是否支持纯前端(绝对路径)
  })
  .sort()

// 生成本地接口列表
let 代码列表 = 支持纯前端的接口.map((a) => {
  let 逻辑相对路径 = a
  let 完整相对路径 = `src/interface/${逻辑相对路径}`
  let 变量名 = '_' + 完整相对路径.replace(/[^a-zA-Z0-9]/g, '_')
  return `import ${变量名} from '../../interface/${逻辑相对路径}'`
})
let 导出列表 = 支持纯前端的接口.map((a) => {
  let 逻辑相对路径 = a
  let 完整相对路径 = `src/interface/${逻辑相对路径}`
  let 变量名 = '_' + 完整相对路径.replace(/[^a-zA-Z0-9]/g, '_')
  return `  ${变量名},`
})

let 新内容 = [
  `// 该文件由脚本自动生成, 请勿修改.`,
  `// 仅包含标记了 { 支持纯前端模式: true } 的接口`,
  ...代码列表,
  '',
  'export let 本地接口列表 = [',
  ...导出列表,
  ']',
  '',
].join('\n')

let 目标文件 = 'src/web/pure-frontend/local-api-list.ts'
let 已有内容 = ''
try {
  已有内容 = fs.readFileSync(目标文件, 'utf-8')
} catch (_错误) {
  // 文件不存在
}

if (已有内容 !== 新内容) {
  fs.writeFileSync(目标文件, 新内容)
  console.log(`文件 ${目标文件} 已更新。提取了 ${支持纯前端的接口.length} 个纯前端接口。`)
} else {
  console.log(`文件 ${目标文件} 内容未变化，跳过写入。`)
}
