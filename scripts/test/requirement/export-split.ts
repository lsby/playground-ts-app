import path from 'node:path'
import ts from 'typescript'

type 辅助文件 = { 路径: string; 内容: string }
let 打印器 = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })

function 模块相对路径(来源目录: string, 文件: string): string {
  let 相对路径 = path.relative(来源目录, 文件).replaceAll('\\', '/').replace(/\.ts$/u, '')
  return 相对路径.startsWith('.') ? 相对路径 : `./${相对路径}`
}

function 保留使用的导入(源码: ts.SourceFile): ts.SourceFile {
  let 使用名们 = new Set<string>()
  let 检查 = (节点: ts.Node): void => {
    if (ts.isImportDeclaration(节点)) return
    if (ts.isIdentifier(节点)) 使用名们.add(节点.text)
    ts.forEachChild(节点, 检查)
  }
  检查(源码)
  let 语句们 = 源码.statements.flatMap((语句): ts.Statement[] => {
    if (ts.isImportDeclaration(语句) === false || 语句.importClause === undefined) return [语句]
    let 子句 = 语句.importClause
    let 绑定 = 子句.namedBindings
    if (绑定 !== undefined && ts.isNamedImports(绑定)) {
      let 名称们 = 绑定.elements.filter((项) => 使用名们.has(项.name.text))
      let 默认名 = 子句.name !== undefined && 使用名们.has(子句.name.text) ? 子句.name : undefined
      if (名称们.length === 0 && 默认名 === undefined) return []
      return [
        ts.factory.updateImportDeclaration(
          语句,
          语句.modifiers,
          ts.factory.updateImportClause(子句, 子句.isTypeOnly, 默认名, ts.factory.updateNamedImports(绑定, 名称们)),
          语句.moduleSpecifier,
          语句.attributes,
        ),
      ]
    }
    return [语句]
  })
  return ts.factory.updateSourceFile(源码, 语句们)
}

/** 输入已经过 Prettier 格式化；只拆完整步骤，辅助模块不会被流程发现器当成新流程。 */
export function 拆分需求测试源码(
  内容: string,
  入口文件: string,
  辅助目录: string,
): { 入口: string; 辅助们: 辅助文件[] } {
  if (内容.split('\n').length <= 500) return { 入口: 内容, 辅助们: [] }
  let 源码 = ts.createSourceFile(入口文件, 内容, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let 步骤数组: ts.ArrayLiteralExpression | undefined
  let 找步骤 = (节点: ts.Node): void => {
    if (
      ts.isPropertyAssignment(节点) &&
      ts.isIdentifier(节点.name) &&
      节点.name.text === '步骤们' &&
      ts.isArrayLiteralExpression(节点.initializer)
    )
      步骤数组 = 节点.initializer
    ts.forEachChild(节点, 找步骤)
  }
  找步骤(源码)
  if (步骤数组 === undefined) throw new Error('长流程导出缺少步骤数组，无法拆分')
  let 原步骤数组 = 步骤数组
  let 分组们: ts.Expression[][] = []
  let 当前组: ts.Expression[] = []
  let 行数 = 0
  for (let 步骤 of 步骤数组.elements) {
    let 步骤行数 = 步骤.getText(源码).split('\n').length
    if (步骤行数 > 350) throw new Error('单个导出步骤超过350行，请用 record_group 按业务动作拆分该步骤后再导出')
    if (行数 + 步骤行数 > 350 && 当前组.length > 0) {
      分组们.push(当前组)
      当前组 = []
      行数 = 0
    }
    当前组.push(步骤)
    行数 += 步骤行数
  }
  if (当前组.length > 0) 分组们.push(当前组)
  let 辅助们 = 分组们.map((步骤们, 索引): 辅助文件 => {
    let 文件 = path.join(辅助目录, `steps-${String(索引 + 1)}.ts`)
    let 转换 = ts.transform(源码, [
      (上下文): ts.Transformer<ts.SourceFile> =>
        (根): ts.SourceFile => {
          let 访问: ts.Visitor = (节点): ts.VisitResult<ts.Node> => {
            if (ts.isStringLiteral(节点)) {
              if (ts.isImportDeclaration(节点.parent) && 节点.text.startsWith('.'))
                return ts.factory.createStringLiteral(
                  模块相对路径(辅助目录, path.resolve(path.dirname(入口文件), 节点.text)),
                )
              let 父 = 节点.parent
              if (
                ts.isNewExpression(父) &&
                ts.isIdentifier(父.expression) &&
                父.expression.text === 'URL' &&
                父.arguments?.[0] === 节点 &&
                父.arguments[1]?.getText(源码) === 'import.meta.url'
              )
                return ts.factory.createStringLiteral(
                  path.relative(辅助目录, path.resolve(path.dirname(入口文件), 节点.text)).replaceAll('\\', '/'),
                )
            }
            return ts.visitEachChild(节点, 访问, 上下文)
          }
          return ts.visitEachChild(根, 访问, 上下文)
        },
    ])
    try {
      let 已转换 = 转换.transformed[0]
      if (已转换 === undefined) throw new Error('辅助模块转换失败')
      let 导入们 = 已转换.statements
        .filter(ts.isImportDeclaration)
        .map((导入) => 打印器.printNode(ts.EmitHint.Unspecified, 导入, 已转换))
      // 按原语句位置从同一转换结果取步骤，保留被重定位的图片 URL。
      let 已转换步骤: ts.ArrayLiteralExpression | undefined
      let 取步骤 = (节点: ts.Node): void => {
        if (ts.isArrayLiteralExpression(节点) && 节点.pos === 原步骤数组.pos) 已转换步骤 = 节点
        ts.forEachChild(节点, 取步骤)
      }
      取步骤(已转换)
      if (已转换步骤 === undefined) throw new Error('辅助模块找不到原步骤')
      let 选中位置 = new Set(步骤们.map((步骤) => 步骤.pos))
      let 代码们 = 已转换步骤.elements
        .filter((步骤) => 选中位置.has(步骤.pos))
        .map((步骤) => 打印器.printNode(ts.EmitHint.Expression, 步骤, 已转换))
      let 辅助源码 = ts.createSourceFile(
        文件,
        [
          ...导入们,
          `import type { 测试上下文 } from '${模块相对路径(辅助目录, 入口文件)}'`,
          `export let 步骤们 = [${代码们.join(',\n')}]`,
        ].join('\n'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      return { 路径: 文件, 内容: 打印器.printFile(保留使用的导入(辅助源码)) }
    } finally {
      转换.dispose()
    }
  })
  let 新步骤 = 分组们.map((_, 索引) =>
    ts.factory.createSpreadElement(ts.factory.createIdentifier(`导出步骤${String(索引 + 1)}`)),
  )
  let 转换 = ts.transform(源码, [
    (上下文): ts.Transformer<ts.SourceFile> =>
      (根): ts.SourceFile => {
        let 访问: ts.Visitor = (节点): ts.VisitResult<ts.Node> => {
          if (节点 === 步骤数组) return ts.factory.createArrayLiteralExpression(新步骤)
          if (ts.isTypeAliasDeclaration(节点) && 节点.name.text === '测试上下文')
            return ts.factory.updateTypeAliasDeclaration(
              节点,
              [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
              节点.name,
              节点.typeParameters,
              节点.type,
            )
          return ts.visitEachChild(节点, 访问, 上下文)
        }
        return ts.visitEachChild(根, 访问, 上下文)
      },
  ])
  try {
    let 根 = 转换.transformed[0]
    if (根 === undefined) throw new Error('主流程转换失败')
    let 新导入 = 辅助们.map(
      ({ 路径 }, 索引) =>
        `import { 步骤们 as 导出步骤${String(索引 + 1)} } from '${模块相对路径(path.dirname(入口文件), 路径)}'`,
    )
    let 入口 = ts.createSourceFile(
      入口文件,
      [...新导入, 打印器.printFile(根)].join('\n'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    return { 入口: 打印器.printFile(保留使用的导入(入口)), 辅助们 }
  } finally {
    转换.dispose()
  }
}
