import { 流程说明模型, type 流程说明, type 测试建议 } from '../../../src/model/test-requirement'
import type {
  JSON值,
  回放条目,
  导出回放步骤,
  操作断言条目,
  操作调用条目,
} from '../../../src/model/test-requirement/recording'
import { 模板资源相对路径, type 模板资源 } from './enhanced-click-code'
import { 生成调用代码, 生成重放地址, type 重放地址配置 } from './operation-code'

type 导出参数 = 流程说明 & {
  需求模块路径: string
  源码目录路径: string
  覆盖验收点键们: readonly string[]
  流程名称: string
  步骤组: readonly 导出回放步骤[]
  测试地址: 重放地址配置
  /** 流程文件名（如 gift-flow.ts），图片模板复制到需求目录 assets/ 时用它命名。 */
  文件名?: string
}
type 步骤代码 = ReturnType<typeof 生成调用代码> & {
  操作编号: number
  建议们: readonly 测试建议[]
  决策说明: string | null
  提交断言结果?: true
}
let 返回浏览器地址的操作 = new Set([
  'browser_open',
  'browser_navigate',
  'browser_reload',
  'browser_history',
  'browser_inspect_page',
  'browser_wait_url',
])

function 获得流程文件名前缀(文件名: string | undefined): string {
  return (文件名 ?? 'template').replace(/\.ts$/u, '')
}

/** 导出的代码引用的图片模板：写出流程文件时要把它们复制到需求目录的 assets/。 */
export function 列出模板资源(步骤组: readonly 导出回放步骤[], 文件名: string | undefined): 模板资源[] {
  let 前缀 = 获得流程文件名前缀(文件名)
  return 步骤组.flatMap(({ 条目们 }) =>
    条目们.flatMap((条目): 模板资源[] => {
      if (条目.kind !== 'call' || 条目.增强?.模板 === undefined || 条目.增强.定位 !== undefined) return []
      return [{ 操作编号: 条目.id, 来源路径: 条目.增强.模板.文件, 相对路径: 模板资源相对路径(前缀, 条目.id) }]
    }),
  )
}

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

function 生成步骤(名称: string, 代码们: readonly 步骤代码[], 备注们: readonly string[]): string {
  let 类型 = 代码们.some((代码) => 代码.类型 === '行为') ? '行为' : '观察'
  let 建议们 = 代码们.flatMap(({ 操作编号, 建议们 }) => 建议们.map((建议) => ({ ...建议, 操作编号 })))
  let 有建议 = 建议们.length > 0
  let 异步 = 有建议 || 代码们.some((代码) => 代码.异步 === true)
  let 提交证据 = 备注们.length > 0 || 代码们.some((代码) => 代码.决策说明 !== null || 代码.提交断言结果 === true)
  let 语句 = 代码们.flatMap(({ 语句们, 决策说明, 建议们, 操作编号, 异步 }) => {
    let 当前语句 = [...语句们]
    if (决策说明 !== null)
      当前语句.unshift(`提交附件([{ 类型: '文本', 内容: ${代码字面量(`决策说明\n${决策说明}`)} }])`)
    if (建议们.length > 0) {
      let 操作函数 = 异步 === true ? 'async (): Promise<void>' : '(): void'
      return [`await 执行操作(${String(操作编号)}, ${操作函数} => {`, ...当前语句.map((行) => `  ${行}`), '})']
    }
    if (代码们.length === 1 || 语句们.some((行) => 行.startsWith('let ')) === false) return 当前语句
    return ['{', ...当前语句.map((行) => `  ${行}`), '}']
  })
  语句.unshift(...备注们.map((备注) => `提交附件([{ 类型: '文本', 内容: ${代码字面量(`步骤备注\n${备注}`)} }])`))
  if (类型 === '行为') 语句.push(异步 === true ? 'return 当前状态' : 'return Promise.resolve(当前状态)')
  let 返回类型 = 类型 === '行为' ? 'Promise<测试上下文>' : 异步 === true ? 'Promise<void>' : 'void'
  let 函数 = 异步 === true ? 'async ' : ''
  let 参数 = ['当前状态']
  if (提交证据 || 有建议) 参数.push(提交证据 ? '提交附件' : '_提交附件')
  if (有建议) 参数.push('执行操作')
  let 选项 = 有建议 ? `, { 建议们: ${JSON.stringify(建议们)} }` : ''
  return [
    `    new ${类型}<测试上下文>(${代码字面量(名称)}, ${函数}(${参数.join(', ')}): ${返回类型} => {`,
    ...语句.flatMap((行) => 行.split('\n').map((子行) => `      ${子行}`)),
    `    }${选项}),`,
  ].join('\n')
}

function 生成断言期望(断言: 操作断言条目, 来源: 操作调用条目, 测试地址: 重放地址配置): string {
  if (断言.expectedFrom !== undefined)
    return `读取操作结果字段(当前状态.结果们, ${String(断言.expectedFrom.sourceId)}, ${代码字面量(断言.expectedFrom.path)})`
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
  let 流程名称 = 参数.流程名称.trim()
  if (流程名称 === '') throw new Error('流程名称不能为空')
  let 覆盖验收点代码 = 参数.覆盖验收点键们.map((键) => `验收点们[${代码字面量(键)}]`).join(', ')
  let 流程说明代码 = Object.entries(流程说明模型.parse(参数)).flatMap(([字段, 值]) =>
    值 === undefined ? [] : [`  ${代码字面量(字段)}: ${代码字面量(值)},`],
  )
  let 条目们 = 参数.步骤组.flatMap((分组) => 分组.条目们)
  let 使用安卓设备 = 条目们.some((条目) => 条目.kind === 'call' && 条目.tool.startsWith('android_'))
  let 使用苹果设备 = 条目们.some((条目) => 条目.kind === 'call' && 条目.tool.startsWith('ios_'))
  if (使用安卓设备 && 使用苹果设备) throw new Error('一条流程不能同时录制 Android 和 iOS 操作')
  let 引用编号们 = new Set(
    条目们.flatMap((条目) => {
      if (条目.kind !== 'assertion') return []
      return 条目.expectedFrom === undefined ? [条目.sourceId] : [条目.sourceId, 条目.expectedFrom.sourceId]
    }),
  )
  let 断言来源们 = new Map<number, 操作调用条目>()
  for (let 条目 of 条目们) if (条目.kind === 'call' && 引用编号们.has(条目.id)) 断言来源们.set(条目.id, 条目)
  let 有断言 = 引用编号们.size > 0
  let 流程文件名前缀 = 获得流程文件名前缀(参数.文件名)
  let 生成条目代码 = (条目: 回放条目): 步骤代码 => {
    let 记录说明 = { 操作编号: 条目.id, 建议们: 条目.suggestions ?? [], 决策说明: 条目.decision ?? null }
    switch (条目.kind) {
      case 'assertion': {
        let 说明 = 条目.notes?.trim()
        let 名称 = `核对操作 #${String(条目.sourceId)} 的结果（断言 #${String(条目.id)}）`
        let 来源 = 断言来源们.get(条目.sourceId)
        if (来源 === undefined) throw new Error(`断言 #${String(条目.id)} 缺少来源操作 #${String(条目.sourceId)}`)
        let 附件选项 = 条目.mergeWithPreviousAttachmentGroup === true ? ', { 并入上一组: true }' : ''
        return {
          名称: 说明 === undefined || 说明 === '' ? 名称 : 说明,
          类型: '观察',
          ...记录说明,
          提交断言结果: true,
          语句们: [
            `let 实际 = 读取操作结果字段(当前状态.结果们, ${String(条目.sourceId)}, ${代码字面量(条目.path)})`,
            `let 预期 = ${生成断言期望(条目, 来源, 参数.测试地址)}`,
            'deepStrictEqual(实际, 预期)',
            "提交附件([{ 类型: '文本', 内容: `预期 ${JSON.stringify(预期)}\\n实际 ${JSON.stringify(实际)}` }]" +
              附件选项 +
              ')',
          ],
        }
      }
      case 'call':
        return {
          ...生成调用代码(条目, { 需要结果: 断言来源们.has(条目.id), 测试地址: 参数.测试地址, 流程文件名前缀 }),
          ...记录说明,
        }
    }
  }
  // 排在第一个界面或设备操作之前、连续的 database_execute 步骤，生成到流程的初始化里（回放每次都从清库加初始化开始）。
  // 其余的 database_execute 保持原来的位置，成为行为步骤；这样回放执行写入的顺序与录制时完全一致。
  let 初始化步骤数 = 0
  while (初始化步骤数 < 参数.步骤组.length) {
    let 分组 = 参数.步骤组[初始化步骤数]
    if (
      分组 === undefined ||
      分组.条目们.every((条目) => 条目.kind === 'call' && 条目.tool === 'database_execute') === false
    )
      break
    初始化步骤数 += 1
  }
  let 初始化分组们 = 参数.步骤组.slice(0, 初始化步骤数)
  let 初始化条目们 = 初始化分组们.flatMap(({ 条目们 }) => 条目们)
  for (let 分组 of 初始化分组们) {
    let 带说明条目 = 分组.条目们.find((条目) => (条目.decision ?? null) !== null || (条目.suggestions ?? []).length > 0)
    if (带说明条目 !== undefined || 分组.备注们.length > 0)
      throw new Error(
        `操作 ${String((带说明条目 ?? 分组.条目们[0])?.id)} 排在界面操作之前，会生成到流程的初始化里，不能带决策说明、建议或步骤备注；请把说明放到后面的步骤`,
      )
  }
  let 初始化代码们 = 初始化条目们.map((条目) => {
    if (条目.kind !== 'call') throw new Error(`操作 ${String(条目.id)} 不能生成到初始化`)
    return 生成调用代码(条目, { 需要结果: 断言来源们.has(条目.id), 测试地址: 参数.测试地址, 流程文件名前缀 })
  })
  let 分组代码们 = 参数.步骤组.slice(初始化步骤数).map(({ 名称, 条目们, 备注们 }) => {
    let 代码们 = 条目们.map(生成条目代码)
    let 第一项 = 代码们[0]
    if (第一项 === undefined) throw new Error('导出步骤至少需要一条记录')
    let 步骤名称 = 名称?.trim() ?? 第一项.名称
    if (步骤名称 === '') throw new Error('导出步骤名称不能为空')
    let 含验收检查 = 条目们.some(
      (条目) =>
        条目.kind === 'assertion' ||
        条目.tool === 'browser_wait' ||
        条目.tool === 'browser_wait_url' ||
        条目.tool === 'android_wait' ||
        条目.tool === 'ios_wait',
    )
    return { 名称: 步骤名称, 代码们, 含验收检查, 备注们 }
  })
  if (分组代码们.some(({ 代码们, 含验收检查 }) => 含验收检查 && 代码们.every(({ 类型 }) => 类型 === '观察')) === false)
    throw new Error('导出流程至少需要一个独立的验收观察，请将断言或界面等待放在只含检查的步骤中')

  let 步骤们 = 分组代码们.flatMap(({ 代码们 }) => 代码们)
  let 全部代码们 = [...初始化代码们, ...步骤们]
  let 导入们: string[] = []
  if (有断言) 导入们.push("import { deepStrictEqual } from 'node:assert/strict'", '')
  let 行为导入 = 步骤们.some((步骤) => 步骤.类型 === '行为') ? '行为, ' : ''
  导入们.push(
    `import { 流程, ${行为导入}观察, 需求测试, 验收点, type 需求测试上下文 } from '${参数.源码目录路径}/model/test-requirement'`,
  )
  if (有断言) {
    导入们.push(
      `import { 读取操作结果字段 } from '${参数.源码目录路径}/test-tools/operation-assertion'`,
      `import type { JSON对象 } from '${参数.源码目录路径}/test-tools/operation-record'`,
    )
  }
  let 数据库结果导入 = [
    ...(全部代码们.some((步骤) => 步骤.需要写入结果工具 === true) ? ['整理数据库写入结果'] : []),
    ...(全部代码们.some((步骤) => 步骤.需要查询结果工具 === true) ? ['整理数据库查询结果'] : []),
  ]
  if (数据库结果导入.length > 0)
    导入们.push(`import { ${数据库结果导入.join(', ')} } from '${参数.源码目录路径}/test-tools/operation-values'`)
  导入们.push(`import { 业务需求, 验收点们 } from ${代码字面量(参数.需求模块路径)}`)

  let 数据类型 = 有断言 ? ' & 测试数据' : ''
  let 初始状态 = 有断言 ? '{ 工具, 结果们: new Map<number, JSON对象>() }' : '{ 工具 }'
  let 初始化语句们 = 初始化代码们.flatMap(({ 语句们 }) => 语句们)
  let 初始化代码 =
    初始化语句们.length === 0
      ? [`  初始化: (工具): 测试上下文 => (${初始状态}),`]
      : [
          '  初始化: (工具): 测试上下文 => {',
          `    let 当前状态: 测试上下文 = ${初始状态}`,
          ...初始化语句们.flatMap((行) => 行.split('\n').map((子行) => `    ${子行}`)),
          '    return 当前状态',
          '  },',
        ]
  return [
    ...导入们,
    '',
    ...(有断言 ? ['type 测试数据 = { 结果们: Map<number, JSON对象> }'] : []),
    `type 测试上下文 = 需求测试上下文${数据类型}`,
    '',
    'let 业务流程 = new 流程({',
    ...初始化代码,
    `  名称: ${代码字面量(流程名称)},`,
    ...流程说明代码,
    '  步骤们: [',
    ...分组代码们.map(({ 名称, 代码们, 备注们 }) => 生成步骤(名称, 代码们, 备注们)),
    '  ],',
    `  覆盖验收点们: [${覆盖验收点代码}].map((点: 验收点 | undefined): 验收点 => {`,
    '    if (点 instanceof 验收点 === false || 业务需求.包含(点) === false)',
    `      throw new Error(${代码字面量(`流程“${流程名称}”引用了无效的验收点`)})`,
    '    return 点',
    '  }),',
    '})',
    '',
    'export default class 导出的需求测试 extends 需求测试 {',
    '  public constructor() {',
    `    super([业务需求], [业务流程], { 使用测试服务: true${使用安卓设备 ? ', 使用安卓设备: true' : ''}${使用苹果设备 ? ', 使用苹果设备: true' : ''} })`,
    '  }',
    '}',
    '',
  ].join('\n')
}
