import { 检查非空文本 } from './model'

export type 选择原始值 = string | number | boolean

export type 选择选项<值 extends 选择原始值> = { 值: 值; 标签: string; 说明: string }

export class 选择<值 extends 选择原始值> {
  public readonly 名称: string
  public readonly 说明: string
  public readonly 可不出现: boolean
  public readonly 选项们: readonly 选择选项<值>[]
  public readonly 可选值们: readonly 值[]

  public constructor(名称: string, 可选值们: readonly 值[])
  public constructor(参数: { 名称: string; 说明: string; 可不出现?: boolean; 选项们: readonly 选择选项<值>[] })
  public constructor(
    名称或参数: string | { 名称: string; 说明: string; 可不出现?: boolean; 选项们: readonly 选择选项<值>[] },
    可选值们?: readonly 值[],
  ) {
    let 名称 = typeof 名称或参数 === 'string' ? 名称或参数 : 名称或参数.名称
    this.名称 = 检查非空文本('选择名称', 名称)
    this.说明 = typeof 名称或参数 === 'string' ? '' : 检查非空文本(`选择“${this.名称}”说明`, 名称或参数.说明)
    this.可不出现 = typeof 名称或参数 === 'string' ? false : (名称或参数.可不出现 ?? false)
    let 选项们 =
      typeof 名称或参数 === 'string'
        ? (可选值们 ?? []).map((值) => ({ 值, 标签: String(值), 说明: String(值) }))
        : 名称或参数.选项们.map((选项) => ({
            值: 选项.值,
            标签: 检查非空文本(`选择“${this.名称}”的选项标签`, 选项.标签),
            说明: 检查非空文本(`选择“${this.名称}”的选项说明`, 选项.说明),
          }))
    if (选项们.length === 0) throw new Error(`选择“${this.名称}”至少需要一个可选值`)
    if (new Set<选择原始值>(选项们.map((选项) => 选项.值)).size !== 选项们.length)
      throw new Error(`选择“${this.名称}”包含重复可选值`)
    this.选项们 = 选项们
    this.可选值们 = 选项们.map((选项) => 选项.值)
  }

  public 接受(值: unknown): 值 is 值 {
    return this.可选值们.some((可选值) => Object.is(可选值, 值))
  }

  public 获得选项(值: 值): 选择选项<值> {
    let 选项 = this.选项们.find((候选) => Object.is(候选.值, 值))
    if (选项 === undefined) throw new Error(`“${String(值)}”不是选择“${this.名称}”的可选值`)
    return 选项
  }
}

export type 任意选择 = 选择<选择原始值>

export type 选择赋值<值 extends 选择原始值 = 选择原始值> = { 选择: 选择<值>; 值: 值 }

export function 选择值<值 extends 选择原始值>(选择定义: 选择<值>, 值: 值): 选择赋值<值> {
  return { 选择: 选择定义, 值 }
}

export interface 选择读取器 {
  是否出现(选择定义: 任意选择): boolean
  读取<值 extends 选择原始值>(选择定义: 选择<值>): 值
  获得全部(): readonly 选择赋值[]
}

export class 选择结果 implements 选择读取器 {
  private readonly 值映射: ReadonlyMap<任意选择, 选择原始值>

  public constructor(赋值们: readonly 选择赋值[]) {
    let 映射 = new Map<任意选择, 选择原始值>()
    for (let 赋值 of 赋值们) {
      if (映射.has(赋值.选择)) throw new Error(`选择“${赋值.选择.名称}”被赋值多次`)
      if (!赋值.选择.接受(赋值.值)) throw new Error(`“${String(赋值.值)}”不是选择“${赋值.选择.名称}”的可选值`)
      映射.set(赋值.选择, 赋值.值)
    }
    this.值映射 = 映射
  }

  public 是否出现(选择定义: 任意选择): boolean {
    return this.值映射.has(选择定义)
  }

  public 读取<值 extends 选择原始值>(选择定义: 选择<值>): 值 {
    let 值 = this.值映射.get(选择定义)
    if (值 === undefined) throw new Error(`尚未指定选择“${选择定义.名称}”`)
    if (!选择定义.接受(值)) throw new Error(`选择“${选择定义.名称}”保存了无效值`)
    return 值
  }

  public 获得全部(): readonly 选择赋值[] {
    return [...this.值映射].map(([选择定义, 值]) => ({ 选择: 选择定义, 值 }))
  }
}

export class 选择约束 {
  public readonly 描述: string
  public readonly 涉及选择们: readonly 任意选择[]
  private readonly 检查函数: (选择们: 选择读取器) => boolean

  public constructor(参数: { 描述: string; 涉及选择们: readonly 任意选择[]; 检查: (选择们: 选择读取器) => boolean }) {
    this.描述 = 检查非空文本('选择约束描述', 参数.描述)
    if (参数.涉及选择们.length === 0) throw new Error(`选择约束“${this.描述}”至少需要涉及一个选择`)
    if (new Set(参数.涉及选择们).size !== 参数.涉及选择们.length)
      throw new Error(`选择约束“${this.描述}”重复引用了选择`)
    this.涉及选择们 = [...参数.涉及选择们]
    this.检查函数 = 参数.检查
  }

  public 满足(选择们: 选择读取器): boolean {
    return this.检查函数(选择们)
  }
}

export function 检查选择结果(选择定义们: readonly 任意选择[], 约束们: readonly 选择约束[], 结果: 选择结果): void {
  let 错误们: string[] = []
  let 已知选择集 = new Set(选择定义们)
  let 名称集 = new Set<string>()
  for (let 当前选择 of 选择定义们) {
    if (名称集.has(当前选择.名称)) 错误们.push(`选择名称“${当前选择.名称}”重复`)
    名称集.add(当前选择.名称)
  }
  let 赋值映射 = new Map(结果.获得全部().map((赋值) => [赋值.选择, 赋值.值]))
  for (let 当前选择 of 选择定义们)
    if (!当前选择.可不出现 && !赋值映射.has(当前选择)) 错误们.push(`未指定选择“${当前选择.名称}”`)
  for (let 赋值 of 结果.获得全部()) if (!已知选择集.has(赋值.选择)) 错误们.push(`指定了未登记的选择“${赋值.选择.名称}”`)
  for (let 约束 of 约束们) {
    for (let 当前选择 of 约束.涉及选择们)
      if (!已知选择集.has(当前选择)) 错误们.push(`选择约束“${约束.描述}”引用了未登记的选择“${当前选择.名称}”`)
    try {
      if (!约束.满足(结果)) 错误们.push(`不满足选择约束：${约束.描述}`)
    } catch (错误) {
      错误们.push(`检查选择约束“${约束.描述}”时出错：${错误 instanceof Error ? 错误.message : String(错误)}`)
    }
  }
  if (错误们.length > 0) throw new Error(`选择方案无效：\n${错误们.map((错误) => `- ${错误}`).join('\n')}`)
}

export function 枚举有效选择方案(选择定义们: readonly 任意选择[], 约束们: readonly 选择约束[]): 选择结果[] {
  let 结果们: 选择结果[] = []
  let 当前赋值们: 选择赋值[] = []
  let 枚举 = (下标: number): void => {
    let 当前选择 = 选择定义们[下标]
    if (当前选择 === undefined) {
      let 结果 = new 选择结果(当前赋值们)
      try {
        检查选择结果(选择定义们, 约束们, 结果)
        结果们.push(结果)
      } catch {
        // 无效组合不是枚举错误，直接排除。
      }
      return
    }
    if (当前选择.可不出现) 枚举(下标 + 1)
    for (let 值 of 当前选择.可选值们) {
      当前赋值们.push({ 选择: 当前选择, 值 })
      枚举(下标 + 1)
      当前赋值们.pop()
    }
  }
  枚举(0)
  return 结果们
}

/**
 * 返回当前选择中仍能延伸成至少一个合法完整方案的值。
 * 用于交互入口逐步收窄选项，避免用户完成所有选择后才发现组合违反约束。
 */
export function 获得可延伸选择值们<值 extends 选择原始值>(参数: {
  选择定义们: readonly 任意选择[]
  约束们: readonly 选择约束[]
  已有赋值们: readonly 选择赋值[]
  当前选择: 选择<值>
}): readonly 值[] {
  if (参数.选择定义们.includes(参数.当前选择) === false)
    throw new Error(`当前选择“${参数.当前选择.名称}”没有登记在选择定义中`)
  let 已有映射 = new Map<任意选择, 选择原始值>()
  for (let 赋值 of 参数.已有赋值们) {
    if (参数.选择定义们.includes(赋值.选择) === false) throw new Error(`已有赋值引用了未登记选择“${赋值.选择.名称}”`)
    if (已有映射.has(赋值.选择)) throw new Error(`已有赋值重复指定选择“${赋值.选择.名称}”`)
    if (赋值.选择.接受(赋值.值) === false) throw new Error(`已有赋值为选择“${赋值.选择.名称}”指定了无效值`)
    已有映射.set(赋值.选择, 赋值.值)
  }
  if (已有映射.has(参数.当前选择)) throw new Error(`当前选择“${参数.当前选择.名称}”已经赋值`)

  let 合法完整方案们 = 枚举有效选择方案(参数.选择定义们, 参数.约束们)
  return 参数.当前选择.可选值们.filter((候选值) =>
    合法完整方案们.some(
      (方案) =>
        方案.是否出现(参数.当前选择) &&
        Object.is(方案.读取(参数.当前选择), 候选值) &&
        [...已有映射].every(([选择定义, 值]) => 方案.是否出现(选择定义) && Object.is(方案.读取(选择定义), 值)),
    ),
  )
}

export type 选择可达图分析 = {
  选择数量: number
  有效完整方案数量: number
  节点数量: number
  边数量: number
  叶节点数量: number
  每层节点数量: readonly number[]
  死路节点数量: number
  不可达选择值们: readonly 选择赋值[]
  所有合法方案均可达: boolean
}

let 选择未出现 = Symbol('选择未出现')
type 内部选择图节点 = { 深度: number; 后继们: Map<选择原始值 | typeof 选择未出现, 内部选择图节点> }

/**
 * 把合法完整方案构造成一棵按选择顺序展开的前缀图。
 * 根节点是尚未选择，边是一次赋值，叶节点是合法完整方案。
 */
export function 分析选择可达图(选择定义们: readonly 任意选择[], 约束们: readonly 选择约束[]): 选择可达图分析 {
  let 有效完整方案们 = 枚举有效选择方案(选择定义们, 约束们)
  let 根节点: 内部选择图节点 = { 深度: 0, 后继们: new Map() }
  let 节点们: 内部选择图节点[] = [根节点]
  let 已到达值映射 = new Map(选择定义们.map((选择定义) => [选择定义, new Set<选择原始值>()]))

  for (let 方案 of 有效完整方案们) {
    let 当前节点 = 根节点
    for (let [下标, 选择定义] of 选择定义们.entries()) {
      let 已出现 = 方案.是否出现(选择定义)
      let 值 = 已出现 ? 方案.读取(选择定义) : 选择未出现
      if (已出现) 已到达值映射.get(选择定义)?.add(方案.读取(选择定义))
      let 后继 = 当前节点.后继们.get(值)
      if (后继 === undefined) {
        后继 = { 深度: 下标 + 1, 后继们: new Map() }
        当前节点.后继们.set(值, 后继)
        节点们.push(后继)
      }
      当前节点 = 后继
    }
  }

  let 每层节点数量 = Array.from({ length: 选择定义们.length + 1 }, () => 0)
  for (let 节点 of 节点们) {
    let 当前数量 = 每层节点数量[节点.深度]
    if (当前数量 === undefined) throw new Error(`选择可达图出现越界深度：${节点.深度}`)
    每层节点数量[节点.深度] = 当前数量 + 1
  }
  let 叶节点数量 = 节点们.filter((节点) => 节点.深度 === 选择定义们.length).length
  let 死路节点数量 = 节点们.filter((节点) => 节点.深度 < 选择定义们.length && 节点.后继们.size === 0).length
  let 不可达选择值们 = 选择定义们.flatMap((选择定义) => {
    let 已到达值们 = 已到达值映射.get(选择定义)
    if (已到达值们 === undefined) throw new Error(`选择“${选择定义.名称}”没有初始化可达值集合`)
    return 选择定义.可选值们.filter((值) => 已到达值们.has(值) === false).map((值) => ({ 选择: 选择定义, 值 }))
  })
  return {
    选择数量: 选择定义们.length,
    有效完整方案数量: 有效完整方案们.length,
    节点数量: 节点们.length,
    边数量: 节点们.reduce((数量, 节点) => 数量 + 节点.后继们.size, 0),
    叶节点数量,
    每层节点数量,
    死路节点数量,
    不可达选择值们,
    所有合法方案均可达: 叶节点数量 === 有效完整方案们.length && 死路节点数量 === 0,
  }
}

export function 检查选择空间可达性(选择定义们: readonly 任意选择[], 约束们: readonly 选择约束[]): 选择可达图分析 {
  let 分析 = 分析选择可达图(选择定义们, 约束们)
  let 错误们: string[] = []
  if (分析.有效完整方案数量 === 0) 错误们.push('选择空间不存在任何合法完整方案')
  if (分析.所有合法方案均可达 === false) 错误们.push('选择图存在死路或合法完整方案没有从根节点到达')
  if (分析.不可达选择值们.length > 0)
    错误们.push(
      `存在永远不可达的选择值：${分析.不可达选择值们.map((赋值) => `${赋值.选择.名称}=${String(赋值.值)}`).join('、')}`,
    )
  if (错误们.length > 0) throw new Error(`选择空间不可达：\n${错误们.map((错误) => `- ${错误}`).join('\n')}`)
  return 分析
}
