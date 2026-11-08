import type { JSON值, 操作断言条目, 操作记录条目, 操作调用条目 } from '../../../src/test-tools/operation-record'
import { 生成调用代码, 生成重放地址, type 重放地址配置 } from './operation-code'

type 导出参数 = {
  需求名称: string
  需求描述?: string
  验收点描述: string
  流程名称: string
  条目们: readonly 操作记录条目[]
  测试地址: 重放地址配置
}
type 步骤代码 = ReturnType<typeof 生成调用代码> & { 决策说明: string | null; 提交断言结果?: true }
let 返回浏览器地址的操作 = new Set([
  'browser_open',
  'browser_navigate',
  'browser_reload',
  'browser_inspect_page',
  'browser_wait_url',
])

function 代码字面量(值: JSON值): string {
  if (Array.isArray(值)) return `[${值.map(代码字面量).join(', ')}]`
  if (值 !== null && typeof 值 === 'object') {
    let 属性们 = Object.entries(值).map(([键, 内容]) => {
      let 属性名 = 键 === '__proto__' ? `[${代码字面量(键)}]` : 代码字面量(键)
      return `${属性名}: ${代码字面量(内容)}`
    })
    return `{${属性们.join(', ')}}`
  }
  if (typeof 值 === 'number') {
    if (Number.isFinite(值) === false) throw new Error('代码字面量必须是有限数字')
    if (Object.is(值, -0)) return '-0'
  }
  return JSON.stringify(值).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')
}

function 生成步骤({ 名称, 类型, 语句们, 异步, 决策说明, 提交断言结果 }: 步骤代码): string {
  let 语句 = [...语句们]
  if (决策说明 !== null) {
    语句.unshift(`提交附件([{ 类型: '文本', 内容: ${代码字面量(`决策说明\n${决策说明}`)} }])`)
  }
  if (类型 === '行为') 语句.push(异步 === true ? 'return 当前状态' : 'return Promise.resolve(当前状态)')
  let 返回类型 = 类型 === '行为' ? 'Promise<测试上下文>' : 异步 === true ? 'Promise<void>' : 'void'
  let 函数 = 异步 === true ? 'async ' : ''
  let 参数 = 决策说明 !== null || 提交断言结果 === true ? '当前状态, 提交附件' : '当前状态'
  return [
    `    new ${类型}<测试上下文>(${代码字面量(名称)}, ${函数}(${参数}): ${返回类型} => {`,
    ...语句.flatMap((行) => 行.split('\n').map((子行) => `      ${子行}`)),
    '    }),',
  ].join('\n')
}

function 验证所选条目(条目们: readonly 操作记录条目[]): ReadonlyMap<number, 操作调用条目> {
  let 条目索引 = new Map<number, { 条目: 操作记录条目; 索引: number }>()
  for (let [索引, 条目] of 条目们.entries()) {
    let id = 条目.id
    if (Number.isSafeInteger(id) === false || id <= 0) throw new Error(`无效的操作记录 ID #${String(id)}`)
    if (条目索引.has(id)) throw new Error(`重复选择了操作记录 #${String(id)}`)
    if (条目.kind === 'call' && 条目.status === 'pending')
      throw new Error(`操作记录 #${String(id)}（${条目.tool}）尚未完成`)
    条目索引.set(id, { 条目, 索引 })
  }
  let 断言来源们 = new Map<number, 操作调用条目>()
  for (let [索引, 条目] of 条目们.entries()) {
    if (条目.kind !== 'assertion') continue
    let 来源 = 条目索引.get(条目.sourceId)
    let 说明 = `断言 #${String(条目.id)} 的来源操作 #${String(条目.sourceId)}`
    if (来源 === undefined || 来源.条目.kind !== 'call') throw new Error(`${说明}未被选中`)
    if (来源.索引 >= 索引) throw new Error(`${说明}必须排在该断言前面`)
    if (来源.条目.status !== 'passed') throw new Error(`${说明}必须是成功完成的调用`)
    断言来源们.set(条目.sourceId, 来源.条目)
  }
  return 断言来源们
}

function 生成断言期望(断言: 操作断言条目, 来源: 操作调用条目, 测试地址: 重放地址配置): string {
  if (
    断言.path.length === 1 &&
    断言.path[0] === 'url' &&
    typeof 断言.expected === 'string' &&
    URL.canParse(断言.expected) &&
    返回浏览器地址的操作.has(来源.tool)
  ) {
    return 生成重放地址(断言.expected, 测试地址)
  }
  return 代码字面量(断言.expected)
}

export function 生成需求测试代码(参数: 导出参数): string {
  let 需求名称 = 参数.需求名称.trim()
  let 验收点描述 = 参数.验收点描述.trim()
  let 需求描述 = 参数.需求描述?.trim() ?? 验收点描述
  let 流程名称 = 参数.流程名称.trim()
  if (需求名称 === '' || 需求描述 === '' || 验收点描述 === '' || 流程名称 === '')
    throw new Error('需求名称、需求描述、验收点描述和流程名称均需非空')
  if (参数.条目们.length === 0) throw new Error('没有选中可导出的操作记录')
  let 断言来源们 = 验证所选条目(参数.条目们)
  let 有断言 = 断言来源们.size > 0
  let 步骤们 = 参数.条目们.map((条目): 步骤代码 => {
    let 决策说明 = 条目.decision ?? null
    switch (条目.kind) {
      case 'assertion': {
        let 说明 = 条目.notes?.trim()
        let 名称 = `核对操作 #${String(条目.sourceId)} 的结果（断言 #${String(条目.id)}）`
        let 来源 = 断言来源们.get(条目.sourceId)
        if (来源 === undefined) throw new Error(`断言 #${String(条目.id)} 缺少来源操作 #${String(条目.sourceId)}`)
        return {
          名称: 说明 === undefined || 说明 === '' ? 名称 : 说明,
          类型: '观察',
          决策说明,
          提交断言结果: true,
          语句们: [
            `let 实际 = 读取操作结果字段(当前状态.结果们, ${String(条目.sourceId)}, ${代码字面量(条目.path)})`,
            `let 预期 = ${生成断言期望(条目, 来源, 参数.测试地址)}`,
            'deepStrictEqual(实际, 预期)',
            "提交附件([{ 类型: '文本', 内容: `预期 ${JSON.stringify(预期)}\\n实际 ${JSON.stringify(实际)}` }])",
          ],
        }
      }
      case 'call':
        return { ...生成调用代码(条目, { 需要结果: 断言来源们.has(条目.id), 测试地址: 参数.测试地址 }), 决策说明 }
    }
  })
  let 有等待检查 = 参数.条目们.some(
    (条目) => 条目.kind === 'call' && (条目.tool === 'browser_wait' || 条目.tool === 'browser_wait_url'),
  )
  if (有断言 === false && 有等待检查 === false)
    throw new Error(
      `所选操作记录 ${参数.条目们.map(({ id }) => `#${String(id)}`).join('、')} 缺少验收检查，请选择断言或浏览器等待步骤`,
    )

  let 导入们: string[] = []
  if (有断言) 导入们.push("import { deepStrictEqual } from 'node:assert/strict'", '')
  let 行为导入 = 步骤们.some((步骤) => 步骤.类型 === '行为') ? '行为, ' : ''
  导入们.push(
    `import { 流程, ${行为导入}观察, 需求, 需求测试, 验收点, type 需求测试上下文 } from '../../src/model/test-requirement'`,
  )
  if (有断言) {
    导入们.push(
      "import { 读取操作结果字段 } from '../../src/test-tools/operation-assertion'",
      "import type { JSON对象 } from '../../src/test-tools/operation-record'",
    )
  }
  if (步骤们.some((步骤) => 步骤.需要查询结果工具 === true))
    导入们.push("import { 整理数据库查询结果 } from '../../src/test-tools/operation-values'")

  let 数据泛型 = 有断言 ? '<测试数据>' : ''
  let 数据类型 = 有断言 ? '测试数据' : 'object'
  let 准备结果 = 有断言 ? '{ 结果们: new Map<number, JSON对象>() }' : '{}'
  return [
    ...导入们,
    '',
    ...(有断言 ? ['type 测试数据 = { 结果们: Map<number, JSON对象> }'] : []),
    `type 测试上下文 = 需求测试上下文${数据泛型}`,
    '',
    `let 验收 = new 验收点({ 描述: ${代码字面量(验收点描述)}, 验收手段: '自动' })`,
    'let 业务需求 = new 需求({',
    `  名称: ${代码字面量(需求名称)},`,
    `  描述: ${代码字面量(需求描述)},`,
    '  验收点们: [验收],',
    '})',
    '',
    'let 业务流程 = new 流程<测试上下文>({',
    `  名称: ${代码字面量(流程名称)},`,
    '  步骤们: [',
    ...步骤们.map(生成步骤),
    '  ],',
    '  覆盖验收点们: [验收],',
    '})',
    '',
    `export default class 导出的需求测试 extends 需求测试${数据泛型} {`,
    '  public constructor() {',
    '    super([业务需求], [业务流程], { 使用测试服务: true })',
    '  }',
    '',
    `  protected override 准备数据(): ${数据类型} {`,
    `    return ${准备结果}`,
    '  }',
    '}',
    '',
  ].join('\n')
}
