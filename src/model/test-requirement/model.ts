import { z } from 'zod'

import type { 选择条件, 选择结果 } from './choice'

function 解析领域文本(名称: string, 值: string): string {
  let 结果 = 值.trim()
  if (结果 === '') throw new Error(`${名称}不能为空`)
  return 结果
}

export type 验收手段 = '自动' | '人工'
export type 可等待结果<结果> = 结果 | Promise<结果>

/**
 * 验收点是需求中可以被独立判定是否成立的最小承诺。
 * 它持有验收描述和验收手段，并供流程声明自己准备证明哪项承诺。
 */
export class 验收点 {
  private readonly 描述: string
  private readonly 验收手段: 验收手段
  public constructor(参数: { 描述: string; 验收手段: 验收手段 }) {
    this.描述 = 解析领域文本('验收点描述', 参数.描述)
    this.验收手段 = 参数.验收手段
  }
  public 获得描述(): string {
    return this.描述
  }
  public 获得验收手段(): 验收手段 {
    return this.验收手段
  }
  public 需要人工验收(): boolean {
    return this.验收手段 === '人工'
  }
}

/**
 * 需求描述系统应当满足的一项业务期望。
 * 它持有名称、描述和组成该需求的验收点，并能判断某个验收点是否属于自己。
 */
export class 需求 {
  private readonly 名称: string
  private readonly 描述: string
  private readonly 验收点们: readonly 验收点[]
  public constructor(参数: { 名称: string; 描述: string; 验收点们: readonly 验收点[] }) {
    this.名称 = 解析领域文本('需求名称', 参数.名称)
    this.描述 = 解析领域文本('需求描述', 参数.描述)
    if (参数.验收点们.length === 0) throw new Error(`需求“${this.名称}”至少需要一个验收点`)
    if (new Set(参数.验收点们).size !== 参数.验收点们.length) throw new Error(`需求“${this.名称}”重复引用了验收点`)
    this.验收点们 = [...参数.验收点们]
  }
  public 获得名称(): string {
    return this.名称
  }
  public 获得描述(): string {
    return this.描述
  }
  public 获得验收点们(): readonly 验收点[] {
    return [...this.验收点们]
  }
  public 包含(验收点值: 验收点): boolean {
    return this.验收点们.includes(验收点值)
  }
  public 检查覆盖(已覆盖验收点们: readonly 验收点[]): void {
    let 未覆盖 = this.验收点们.filter((验收点值) => 已覆盖验收点们.includes(验收点值) === false)
    if (未覆盖.length > 0)
      throw new Error(`需求“${this.名称}”存在未覆盖验收点：${未覆盖.map((验收点值) => 验收点值.获得描述()).join('、')}`)
  }
}

export let 流程步骤附件列表模型 = z
  .discriminatedUnion('类型', [
    z.object({ 类型: z.literal('文本'), 内容: z.string().trim().min(1) }).strict(),
    z
      .object({
        类型: z.literal('图片'),
        内容类型: z.enum(['image/png', 'image/jpeg', 'image/webp']),
        内容: z.string().min(1).base64(),
        说明: z.string().trim().min(1).optional(),
      })
      .strict(),
  ])
  .array()
export type 流程步骤附件 = z.infer<typeof 流程步骤附件列表模型>[number]
export type 提交步骤附件 = (附件们: readonly 流程步骤附件[]) => void

/**
 * 流程步骤是行为和观察共同具有的一般概念。
 * 它持有可供运行日志和报告识别的步骤描述，具体执行语义由子类提供。
 */
export abstract class 流程步骤 {
  private readonly 描述: string
  protected constructor(描述: string) {
    this.描述 = 解析领域文本('流程步骤描述', 描述)
  }
  public 获得描述(): string {
    return this.描述
  }
}

/**
 * 行为是测试过程中能够使系统从当前状态迁移到下一状态的操作。
 * 它持有状态迁移函数，能够执行一次迁移。
 */
export class 行为<系统状态 extends object> extends 流程步骤 {
  private readonly 迁移函数: (当前状态: 系统状态, 提交附件: 提交步骤附件) => Promise<系统状态>
  public constructor(描述: string, 迁移函数: (当前状态: 系统状态, 提交附件: 提交步骤附件) => Promise<系统状态>) {
    super(描述)
    this.迁移函数 = 迁移函数
  }
  public 迁移(当前状态: 系统状态, 提交附件: 提交步骤附件): Promise<系统状态> {
    return this.迁移函数(当前状态, 提交附件)
  }
}

/**
 * 观察是对系统当前状态进行无副作用判定的流程步骤。
 * 验证函数可提交附件，验证失败时通过异常终止流程。
 */
export class 观察<系统状态 extends object> extends 流程步骤 {
  private readonly 验证函数: (当前状态: Readonly<系统状态>, 提交附件: 提交步骤附件) => 可等待结果<void>
  public constructor(
    描述: string,
    验证函数: (当前状态: Readonly<系统状态>, 提交附件: 提交步骤附件) => 可等待结果<void>,
  ) {
    super(描述)
    this.验证函数 = 验证函数
  }
  public async 验证(当前状态: Readonly<系统状态>, 提交附件: 提交步骤附件): Promise<void> {
    await this.验证函数(当前状态, 提交附件)
  }
}

/**
 * 状态表示被测系统在某一时刻可供行为和观察使用的实际内容。
 * 它封装当前系统内容，能够接受行为产生新状态，并向观察提供只读视图。
 */
export class 状态<系统状态 extends object> {
  private readonly 系统内容: 系统状态
  public constructor(系统内容: 系统状态) {
    this.系统内容 = 系统内容
  }
  public async 迁移(当前行为: 行为<系统状态>, 提交附件: 提交步骤附件): Promise<状态<系统状态>> {
    return new 状态<系统状态>(await 当前行为.迁移(this.系统内容, 提交附件))
  }
  public 读取(): Readonly<系统状态> {
    return this.系统内容
  }
}

/**
 * 流程是为了证明一组验收点而声明的有序运行过程。
 * 它持有名称、行为或观察步骤以及目标验收点，并能识别自己是否需要人工验收。
 */
export class 流程<系统状态 extends object> {
  private readonly 名称: string
  private readonly 步骤们: ReadonlyArray<行为<系统状态> | 观察<系统状态>>
  private readonly 覆盖验收点们: readonly 验收点[]
  private readonly 选择结果值: 选择结果 | undefined
  private readonly 选择条件们: readonly 选择条件[]
  public constructor(参数: {
    名称: string
    步骤们: ReadonlyArray<行为<系统状态> | 观察<系统状态>>
    覆盖验收点们: readonly 验收点[]
    选择结果?: 选择结果 | undefined
    选择条件们?: readonly 选择条件[] | undefined
  }) {
    this.名称 = 解析领域文本('流程名称', 参数.名称)
    if (参数.步骤们.length === 0 || 参数.步骤们.some((步骤) => 步骤 instanceof 观察) === false)
      throw new Error(`流程“${this.名称}”至少需要一个观察`)
    if (参数.覆盖验收点们.length === 0 || new Set(参数.覆盖验收点们).size !== 参数.覆盖验收点们.length)
      throw new Error(`流程“${this.名称}”的验收点无效`)
    this.步骤们 = [...参数.步骤们]
    this.覆盖验收点们 = [...参数.覆盖验收点们]
    this.选择结果值 = 参数.选择结果
    this.选择条件们 = [...(参数.选择条件们 ?? [])]
    if (this.选择条件们.length > 0 && this.选择结果值 === undefined)
      throw new Error(`流程“${this.名称}”声明了选择条件但没有选择结果`)
    this.选择结果值?.验证(...this.选择条件们)
  }
  public 获得名称(): string {
    return this.名称
  }
  public 获得步骤们(): ReadonlyArray<行为<系统状态> | 观察<系统状态>> {
    return [...this.步骤们]
  }
  public 获得覆盖验收点们(): readonly 验收点[] {
    return [...this.覆盖验收点们]
  }
  public 获得选择结果(): 选择结果 | undefined {
    return this.选择结果值
  }
  public 获得选择条件们(): readonly 选择条件[] {
    return [...this.选择条件们]
  }
  public 包含人工验收(): boolean {
    return this.覆盖验收点们.some((验收点值) => 验收点值.需要人工验收())
  }
}
