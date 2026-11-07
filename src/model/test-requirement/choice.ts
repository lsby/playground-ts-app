export type 选择原始值 = string | number | boolean

export type 选择选项<值 extends 选择原始值> = { 值: 值; 标签: string; 说明: string }

export type 选择赋值<值 extends 选择原始值 = 选择原始值> = { 选择: 选择<值>; 值: 值 }

export type 任意选择 = 选择<选择原始值>

/**
 * 选择表示测试开始前需要确定的一个业务决策点。
 * 它持有名称、说明和有限选项，能够校验候选值并产生属于自己的选择赋值。
 */
export class 选择<值 extends 选择原始值> {
  private static 检查文本(名称: string, 值: string): string {
    let 结果 = 值.trim()
    if (结果 === '') throw new Error(`${名称}不能为空`)
    return 结果
  }

  private readonly 名称: string
  private readonly 说明: string
  private readonly 选项们: readonly 选择选项<值>[]

  public constructor(参数: { 名称: string; 说明: string; 选项们: readonly 选择选项<值>[] }) {
    this.名称 = 选择.检查文本('选择名称', 参数.名称)
    this.说明 = 选择.检查文本(`选择“${this.名称}”说明`, 参数.说明)
    if (参数.选项们.length === 0) throw new Error(`选择“${this.名称}”至少需要一个选项`)
    if (new Set<选择原始值>(参数.选项们.map((选项) => 选项.值)).size !== 参数.选项们.length)
      throw new Error(`选择“${this.名称}”包含重复选项值`)
    this.选项们 = 参数.选项们.map((选项) => ({
      值: 选项.值,
      标签: 选择.检查文本(`选择“${this.名称}”的选项标签`, 选项.标签),
      说明: 选择.检查文本(`选择“${this.名称}”的选项说明`, 选项.说明),
    }))
  }

  public 获得名称(): string {
    return this.名称
  }

  public 获得说明(): string {
    return this.说明
  }

  public 获得选项们(): readonly 选择选项<值>[] {
    return this.选项们.map((选项) => ({ ...选项 }))
  }

  public 接受(值: unknown): 值 is 值 {
    return this.选项们.some((选项) => Object.is(选项.值, 值))
  }

  public 作出选择(值: 值): 选择赋值<值> {
    if (this.接受(值) === false) throw new Error(`“${String(值)}”不是选择“${this.名称}”的有效选项`)
    return { 选择: this, 值 }
  }

  public 获得选项(值: 值): 选择选项<值> {
    let 选项 = this.选项们.find((候选) => Object.is(候选.值, 值))
    if (选项 === undefined) throw new Error(`“${String(值)}”不是选择“${this.名称}”的有效选项`)
    return { ...选项 }
  }
}

/**
 * 选择结果表示一次测试场景已经作出的业务选择集合。
 * 它持有每个选择及其唯一赋值，能够按选择定义读取结果，并用选择条件验证自身是否允许。
 */
export class 选择结果 {
  private readonly 值映射: ReadonlyMap<任意选择, 选择原始值>

  public constructor(赋值们: readonly 选择赋值[]) {
    let 映射 = new Map<任意选择, 选择原始值>()
    for (let 赋值 of 赋值们) {
      if (映射.has(赋值.选择)) throw new Error(`选择“${赋值.选择.获得名称()}”不能被重复赋值`)
      if (赋值.选择.接受(赋值.值) === false)
        throw new Error(`“${String(赋值.值)}”不是选择“${赋值.选择.获得名称()}”的有效选项`)
      映射.set(赋值.选择, 赋值.值)
    }
    this.值映射 = 映射
  }

  public 是否包含(选择定义: 任意选择): boolean {
    return this.值映射.has(选择定义)
  }

  public 读取<值 extends 选择原始值>(选择定义: 选择<值>): 值 {
    let 值 = this.值映射.get(选择定义)
    if (值 === undefined) throw new Error(`尚未指定选择“${选择定义.获得名称()}”`)
    if (选择定义.接受(值) === false) throw new Error(`选择“${选择定义.获得名称()}”保存了无效值`)
    return 值
  }

  public 获得全部(): readonly 选择赋值[] {
    return [...this.值映射].map(([选择定义, 值]) => ({ 选择: 选择定义, 值 }))
  }

  public 验证(...条件们: readonly 选择条件[]): void {
    for (let 条件 of 条件们)
      if (条件.是否满足(this) === false) throw new Error(`选择结果不满足条件：${条件.获得描述()}`)
  }
}

/**
 * 选择条件表示业务选择之间必须成立的一条约束关系。
 * 它持有条件描述和判定行为，能够判断一个选择结果是否被当前业务规则允许。
 */
export class 选择条件 {
  private readonly 描述: string
  private readonly 判定函数: (结果: 选择结果) => boolean

  public constructor(描述: string, 判定函数: (结果: 选择结果) => boolean) {
    this.描述 = 描述.trim()
    if (this.描述 === '') throw new Error('选择条件描述不能为空')
    this.判定函数 = 判定函数
  }

  public 获得描述(): string {
    return this.描述
  }

  public 是否满足(结果: 选择结果): boolean {
    return this.判定函数(结果)
  }
}
