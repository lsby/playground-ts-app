/**
 * 从需求出发的测试模型。
 *
 * 模型对象不要求手写 ID：需求、验收点、选择、状态和流程之间都通过
 * TypeScript 对象引用建立关系，名称只用于日志和持久化快照的可读定位。
 */

export type 验收手段 = '自动' | '人工'

/** 外层为“或”，每个内层方案中的依赖为“且”；空数组表示没有依赖。 */
export type 依赖方案们<依赖条件> = readonly (readonly 依赖条件[])[]

export class 验收点<依赖条件> {
  public readonly 描述: string
  public readonly 验收手段: 验收手段
  public readonly 依赖方案们: 依赖方案们<依赖条件>

  public constructor(参数: { 描述: string; 验收手段: 验收手段; 依赖方案们?: 依赖方案们<依赖条件> }) {
    this.描述 = 检查非空文本('验收点描述', 参数.描述)
    this.验收手段 = 参数.验收手段
    this.依赖方案们 = 参数.依赖方案们?.map((方案) => [...方案]) ?? []
    for (let 方案 of this.依赖方案们) {
      if (方案.length === 0) throw new Error(`验收点“${this.描述}”包含空依赖方案；没有依赖时请使用空的方案列表`)
      if (new Set(方案).size !== 方案.length) throw new Error(`验收点“${this.描述}”的同一依赖方案中存在重复条件`)
    }
  }
}

export class 需求<依赖条件> {
  public readonly 名称: string
  public readonly 描述: string
  public readonly 验收点们: readonly 验收点<依赖条件>[]

  public constructor(参数: { 名称: string; 描述: string; 验收点们: readonly 验收点<依赖条件>[] }) {
    this.名称 = 检查非空文本('需求名称', 参数.名称)
    this.描述 = 检查非空文本('需求描述', 参数.描述)
    if (参数.验收点们.length === 0) throw new Error(`需求“${this.名称}”至少需要一个验收点`)
    if (new Set(参数.验收点们).size !== 参数.验收点们.length) throw new Error(`需求“${this.名称}”重复引用了验收点`)
    this.验收点们 = [...参数.验收点们]
  }
}

export type 证据 = { 手段: string; 描述: string; 内容?: unknown; 附件路径?: string }

export type 观察结果 = { 通过: true; 证据们: readonly 证据[] } | { 通过: false; 原因: string; 证据们: readonly 证据[] }

export type 可等待结果<结果> = 结果 | Promise<结果>

export class 行为<上下文> {
  public readonly 描述: string
  private readonly 执行函数: (上下文: 上下文) => 可等待结果<void>

  public constructor(描述: string, 执行函数: (上下文: 上下文) => 可等待结果<void>) {
    this.描述 = 检查非空文本('行为描述', 描述)
    this.执行函数 = 执行函数
  }

  public async 执行(上下文: 上下文): Promise<void> {
    await this.执行函数(上下文)
  }
}

export class 观察<上下文> {
  public readonly 描述: string
  private readonly 执行函数: (上下文: 上下文) => 可等待结果<观察结果>

  public constructor(描述: string, 执行函数: (上下文: 上下文) => 可等待结果<观察结果>) {
    this.描述 = 检查非空文本('观察描述', 描述)
    this.执行函数 = 执行函数
  }

  public async 执行(上下文: 上下文): Promise<观察结果> {
    let 结果 = await this.执行函数(上下文)
    return 规范化观察结果(this.描述, 结果)
  }
}

export type 流程步骤<上下文> = 行为<上下文> | 观察<上下文>

/**
 * 状态保存“从初始状态开始依次施加哪些行为”的定义。
 * `状态.施加(行为)`就是“状态 + 行为 = 新状态”；展开时只做数组连接，
 * 因而行为组合天然满足结合律。
 */
export class 状态<上下文> {
  public static 初始<上下文>(参数: { 名称: string; 准备?: (上下文: 上下文) => 可等待结果<void> }): 状态<上下文> {
    return new 状态<上下文>({
      名称: 参数.名称,
      初始状态: undefined,
      前态: undefined,
      新增行为们: [],
      ...(参数.准备 === undefined ? {} : { 准备初始状态: 参数.准备 }),
    })
  }

  public readonly 名称: string
  private readonly 初始状态值: 状态<上下文>
  private readonly 前态: 状态<上下文> | undefined
  private readonly 新增行为们: readonly 行为<上下文>[]
  private readonly 准备初始状态函数: ((上下文: 上下文) => 可等待结果<void>) | undefined

  private constructor(参数: {
    名称: string
    初始状态: 状态<上下文> | undefined
    前态: 状态<上下文> | undefined
    新增行为们: readonly 行为<上下文>[]
    准备初始状态?: (上下文: 上下文) => 可等待结果<void>
  }) {
    this.名称 = 检查非空文本('状态名称', 参数.名称)
    this.初始状态值 = 参数.初始状态 ?? this
    this.前态 = 参数.前态
    this.新增行为们 = [...参数.新增行为们]
    this.准备初始状态函数 = 参数.准备初始状态
  }

  public 施加(新状态名称: string, ...行为们: readonly 行为<上下文>[]): 状态<上下文> {
    if (行为们.length === 0) throw new Error(`状态“${this.名称}”至少需要施加一个行为才能产生新状态`)
    return new 状态<上下文>({ 名称: 新状态名称, 初始状态: this.初始状态值, 前态: this, 新增行为们: 行为们 })
  }

  public 获得初始状态(): 状态<上下文> {
    return this.初始状态值
  }

  public async 准备初始状态(上下文: 上下文): Promise<void> {
    if (this !== this.初始状态值) throw new Error(`只能通过初始状态“${this.初始状态值.名称}”执行初始状态准备`)
    if (this.准备初始状态函数 !== undefined) await this.准备初始状态函数(上下文)
  }

  public 展开行为们(): readonly 行为<上下文>[] {
    let 层们: Array<readonly 行为<上下文>[]> = []
    let 已访问 = new Set<状态<上下文>>()
    let 当前: 状态<上下文> | undefined = this
    while (当前 !== undefined) {
      if (已访问.has(当前)) throw new Error(`状态“${this.名称}”的前态关系形成了循环`)
      已访问.add(当前)
      层们.push(当前.新增行为们)
      当前 = 当前.前态
    }
    return 层们.reverse().flatMap((行为们) => [...行为们])
  }
}

export class 流程<上下文, 依赖条件> {
  public readonly 名称: string
  public readonly 给定状态: 状态<上下文>
  public readonly 步骤们: readonly 流程步骤<上下文>[]
  public readonly 覆盖验收点们: readonly 验收点<依赖条件>[]

  public constructor(参数: {
    名称: string
    给定状态: 状态<上下文>
    步骤们: readonly 流程步骤<上下文>[]
    覆盖验收点们: readonly 验收点<依赖条件>[]
  }) {
    this.名称 = 检查非空文本('流程名称', 参数.名称)
    if (参数.步骤们.length === 0) throw new Error(`流程“${this.名称}”至少需要一个步骤`)
    if (参数.步骤们.some((步骤) => 步骤 instanceof 观察) === false)
      throw new Error(`流程“${this.名称}”至少需要一个观察`)
    if (参数.覆盖验收点们.length === 0) throw new Error(`流程“${this.名称}”至少需要覆盖一个验收点`)
    if (new Set(参数.覆盖验收点们).size !== 参数.覆盖验收点们.length)
      throw new Error(`流程“${this.名称}”重复引用了验收点`)
    this.给定状态 = 参数.给定状态
    this.步骤们 = [...参数.步骤们]
    this.覆盖验收点们 = [...参数.覆盖验收点们]
  }
}

export function 依赖已满足<依赖条件>(方案们: 依赖方案们<依赖条件>, 已满足条件们: ReadonlySet<依赖条件>): boolean {
  if (方案们.length === 0) return true
  return 方案们.some((方案) => 方案.every((条件) => 已满足条件们.has(条件)))
}

export function 检查非空文本(名称: string, 值: string): string {
  let 结果 = 值.trim()
  if (结果.length === 0) throw new Error(`${名称}不能为空`)
  return 结果
}

function 规范化观察结果(观察描述: string, 结果: 观察结果): 观察结果 {
  let 证据们 = 结果.证据们.map(
    (证据): 证据 => ({
      手段: 检查非空文本(`观察“${观察描述}”的证据手段`, 证据.手段),
      描述: 检查非空文本(`观察“${观察描述}”的证据描述`, 证据.描述),
      ...('内容' in 证据 ? { 内容: 证据.内容 } : {}),
      ...(证据.附件路径 === undefined ? {} : { 附件路径: 检查非空文本('证据附件路径', 证据.附件路径) }),
    }),
  )
  if (结果.通过) return { 通过: true, 证据们 }
  return { 通过: false, 原因: 检查非空文本(`观察“${观察描述}”的失败原因`, 结果.原因), 证据们 }
}
