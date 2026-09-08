import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import {
  检查选择空间可达性,
  检查选择结果,
  type 任意选择,
  type 选择约束,
  type 选择结果,
  type 选择读取器,
} from './choice'
import { 依赖已满足, 流程, 状态, 观察, type 观察结果, type 证据, type 需求, type 验收点 } from './model'
import { 快照管理器, type 快照清单, type 快照配置 } from './snapshot'

export class 依赖条件集<依赖条件> {
  private readonly 条件集: ReadonlySet<依赖条件>

  public constructor(条件们: readonly 依赖条件[]) {
    this.条件集 = new Set(条件们)
  }

  public 已满足(条件: 依赖条件): boolean {
    return this.条件集.has(条件)
  }

  public 获得全部(): readonly 依赖条件[] {
    return [...this.条件集]
  }

  public 作为只读集合(): ReadonlySet<依赖条件> {
    return this.条件集
  }
}

export interface 快照入口 {
  /** 请求在当前步骤成功结束后保存快照。 */
  保存(说明?: string): void
}

export type 流程上下文<系统上下文, 依赖条件> = {
  readonly 系统: 系统上下文
  readonly 依赖: 依赖条件集<依赖条件>
  readonly 选择: 选择读取器
  readonly 快照: 快照入口
}

export type 项目测试元数据<系统上下文, 依赖条件> = {
  初始状态: 状态<流程上下文<系统上下文, 依赖条件>>
  依赖条件们: readonly 依赖条件[]
  选择们: readonly 任意选择[]
  选择约束们: readonly 选择约束[]
  /** 不声明时接受任意证据手段；具体项目可借此建立黑盒证据边界。 */
  证据策略?: { 允许手段们: readonly string[] }
  快照?: 快照配置<流程上下文<系统上下文, 依赖条件>>
}

export type 观察记录 = { 观察描述: string; 结果: 观察结果 }

export type 流程执行报告<依赖条件> = {
  流程名称: string
  覆盖验收点们: readonly 验收点<依赖条件>[]
  观察记录们: readonly 观察记录[]
  创建快照们: readonly 快照清单[]
  从快照恢复: 快照清单 | undefined
  执行步骤数量: number
  跳过步骤数量: number
}

export type 命名步骤执行器 = <结果>(描述: string, 执行: () => Promise<结果>) => Promise<结果>

export class 观察失败错误 extends Error {
  public readonly 证据们: readonly 证据[]

  public constructor(观察描述: string, 结果: Extract<观察结果, { 通过: false }>) {
    super(`观察“${观察描述}”失败：${结果.原因}`)
    this.name = '观察失败错误'
    this.证据们 = 结果.证据们
  }
}

export class 测试模型<系统上下文 extends object, 依赖条件> {
  public readonly 元数据: 项目测试元数据<系统上下文, 依赖条件>
  public readonly 需求们: readonly 需求<依赖条件>[]
  public readonly 流程们: readonly 流程<流程上下文<系统上下文, 依赖条件>, 依赖条件>[]

  public constructor(参数: {
    元数据: 项目测试元数据<系统上下文, 依赖条件>
    需求们: readonly 需求<依赖条件>[]
    流程们: readonly 流程<流程上下文<系统上下文, 依赖条件>, 依赖条件>[]
  }) {
    this.元数据 = 参数.元数据
    this.需求们 = [...参数.需求们]
    this.流程们 = [...参数.流程们]
  }

  public 检查(): void {
    let 错误们: string[] = []
    if (this.元数据.初始状态.获得初始状态() !== this.元数据.初始状态)
      错误们.push(`项目元数据中的“${this.元数据.初始状态.名称}”不是初始状态`)
    let 依赖集 = new Set(this.元数据.依赖条件们)
    if (依赖集.size !== this.元数据.依赖条件们.length) 错误们.push('项目元数据重复登记了依赖条件')
    if (new Set(this.元数据.选择们).size !== this.元数据.选择们.length) 错误们.push('项目元数据重复登记了选择')
    let 允许证据手段们 = this.元数据.证据策略?.允许手段们
    if (允许证据手段们 !== undefined) {
      if (允许证据手段们.length === 0) 错误们.push('证据策略至少需要允许一种证据手段')
      if (new Set(允许证据手段们).size !== 允许证据手段们.length) 错误们.push('证据策略重复登记了证据手段')
      if (允许证据手段们.some((手段) => 手段.trim() === '')) 错误们.push('证据策略包含空的证据手段')
    }
    let 选择名称们 = new Set<string>()
    for (let 当前选择 of this.元数据.选择们) {
      if (选择名称们.has(当前选择.名称)) 错误们.push(`项目元数据中的选择名称“${当前选择.名称}”重复`)
      选择名称们.add(当前选择.名称)
    }
    let 已知选择集 = new Set(this.元数据.选择们)
    if (new Set(this.元数据.选择约束们).size !== this.元数据.选择约束们.length)
      错误们.push('项目元数据重复登记了选择约束')
    for (let 约束 of this.元数据.选择约束们)
      for (let 当前选择 of 约束.涉及选择们)
        if (!已知选择集.has(当前选择)) 错误们.push(`选择约束“${约束.描述}”引用了未登记的选择“${当前选择.名称}”`)
    try {
      检查选择空间可达性(this.元数据.选择们, this.元数据.选择约束们)
    } catch (错误) {
      错误们.push(错误 instanceof Error ? 错误.message : String(错误))
    }

    let 验收点集 = new Set<验收点<依赖条件>>()
    let 需求集 = new Set<需求<依赖条件>>()
    if (this.需求们.length === 0) 错误们.push('测试模型至少需要一个需求')
    for (let 当前需求 of this.需求们) {
      if (需求集.has(当前需求)) 错误们.push(`需求“${当前需求.名称}”被重复登记`)
      需求集.add(当前需求)
      for (let 当前验收点 of 当前需求.验收点们) {
        if (验收点集.has(当前验收点)) 错误们.push(`验收点“${当前验收点.描述}”被多个需求引用`)
        验收点集.add(当前验收点)
        for (let 方案 of 当前验收点.依赖方案们)
          for (let 条件 of 方案)
            if (!依赖集.has(条件)) 错误们.push(`验收点“${当前验收点.描述}”引用了未登记的依赖条件“${String(条件)}”`)
      }
    }

    let 流程集 = new Set<流程<流程上下文<系统上下文, 依赖条件>, 依赖条件>>()
    let 流程名称们 = new Set<string>()
    if (this.流程们.length === 0) 错误们.push('测试模型至少需要一个流程')
    for (let 当前流程 of this.流程们) {
      if (流程集.has(当前流程)) 错误们.push(`流程“${当前流程.名称}”被重复登记`)
      if (流程名称们.has(当前流程.名称)) 错误们.push(`流程名称“${当前流程.名称}”重复`)
      流程集.add(当前流程)
      流程名称们.add(当前流程.名称)
      if (当前流程.给定状态.获得初始状态() !== this.元数据.初始状态)
        错误们.push(`流程“${当前流程.名称}”不是从项目元数据的初始状态“${this.元数据.初始状态.名称}”派生的`)
      for (let 当前验收点 of 当前流程.覆盖验收点们)
        if (!验收点集.has(当前验收点)) 错误们.push(`流程“${当前流程.名称}”引用了未登记的验收点“${当前验收点.描述}”`)
      try {
        当前流程.给定状态.展开行为们()
      } catch (错误) {
        错误们.push(`流程“${当前流程.名称}”的给定状态无效：${错误 instanceof Error ? 错误.message : String(错误)}`)
      }
    }
    if (错误们.length > 0) throw new Error(`测试模型定义无效：\n${错误们.map((错误) => `- ${错误}`).join('\n')}`)
  }

  public 创建执行器(参数: {
    系统上下文: 系统上下文
    已满足依赖们: readonly 依赖条件[]
    选择结果: 选择结果
    日志?: (消息: string) => void
    执行命名步骤?: 命名步骤执行器
  }): 流程执行器<系统上下文, 依赖条件> {
    this.检查()
    return new 流程执行器({
      模型: this,
      系统上下文: 参数.系统上下文,
      已满足依赖们: 参数.已满足依赖们,
      选择结果: 参数.选择结果,
      ...(参数.日志 === undefined ? {} : { 日志: 参数.日志 }),
      ...(参数.执行命名步骤 === undefined ? {} : { 执行命名步骤: 参数.执行命名步骤 }),
    })
  }
}

export class 流程执行器<系统上下文 extends object, 依赖条件> {
  private readonly 模型: 测试模型<系统上下文, 依赖条件>
  private readonly 选择结果: 选择结果
  private readonly 依赖: 依赖条件集<依赖条件>
  private readonly 上下文: 流程上下文<系统上下文, 依赖条件>
  private readonly 快照管理器: 快照管理器<流程上下文<系统上下文, 依赖条件>> | undefined
  private readonly 日志: (消息: string) => void
  private readonly 执行命名步骤: 命名步骤执行器
  private readonly 待保存快照说明们: string[] = []
  private 允许请求快照 = false

  public constructor(参数: {
    模型: 测试模型<系统上下文, 依赖条件>
    系统上下文: 系统上下文
    已满足依赖们: readonly 依赖条件[]
    选择结果: 选择结果
    日志?: (消息: string) => void
    执行命名步骤?: 命名步骤执行器
  }) {
    this.模型 = 参数.模型
    this.选择结果 = 参数.选择结果
    this.依赖 = new 依赖条件集(参数.已满足依赖们)
    this.日志 = 参数.日志 ?? console.log
    let 直接执行: 命名步骤执行器 = async <结果>(_描述: string, 执行: () => Promise<结果>): Promise<结果> => await 执行()
    this.执行命名步骤 = 参数.执行命名步骤 ?? 直接执行
    this.上下文 = {
      系统: 参数.系统上下文,
      依赖: this.依赖,
      选择: this.选择结果,
      快照: {
        保存: (说明?: string): void => {
          if (!this.允许请求快照) throw new Error('只能在流程步骤内请求保存快照')
          let 规范说明 = 说明?.trim()
          this.待保存快照说明们.push(规范说明 === undefined || 规范说明 === '' ? '流程检查点' : 规范说明)
        },
      },
    }
    this.快照管理器 =
      this.模型.元数据.快照 === undefined ? undefined : new 快照管理器(this.模型.元数据.快照, this.上下文)
    检查选择结果(this.模型.元数据.选择们, this.模型.元数据.选择约束们, this.选择结果)
    this.检查依赖条件()
  }

  public async 执行(
    当前流程: 流程<流程上下文<系统上下文, 依赖条件>, 依赖条件>,
    参数: { 从快照恢复?: string } = {},
  ): Promise<流程执行报告<依赖条件>> {
    if (!this.模型.流程们.includes(当前流程)) throw new Error(`流程“${当前流程.名称}”不属于当前测试模型`)
    let 不可执行验收点们 = 当前流程.覆盖验收点们.filter(
      (验收点值) => !依赖已满足(验收点值.依赖方案们, this.依赖.作为只读集合()),
    )
    if (不可执行验收点们.length > 0)
      throw new Error(
        `当前依赖条件不足，无法执行流程“${当前流程.名称}”：${不可执行验收点们.map((点) => 点.描述).join('、')}`,
      )

    let 从快照恢复: 快照清单 | undefined
    let 开始步骤下标 = 0
    if (参数.从快照恢复 !== undefined) {
      if (this.快照管理器 === undefined) throw new Error('当前项目没有配置快照恢复行为')
      let { 清单 } = await this.快照管理器.读取(参数.从快照恢复)
      this.检查恢复兼容性(当前流程, 清单)
      await this.执行命名步骤(
        `恢复项目初始状态：${this.模型.元数据.初始状态.名称}`,
        async () => await this.模型.元数据.初始状态.准备初始状态(this.上下文),
      )
      从快照恢复 = await this.快照管理器.恢复(参数.从快照恢复)
      开始步骤下标 = 从快照恢复.运行位置.下一个步骤下标
      this.日志(`已从快照 ${从快照恢复.uuid} 恢复，将跳过前 ${开始步骤下标} 个流程步骤`)
    } else {
      let 初始状态 = this.模型.元数据.初始状态
      await this.执行命名步骤(`准备初始状态：${初始状态.名称}`, async () => await 初始状态.准备初始状态(this.上下文))
      for (let 状态行为 of 当前流程.给定状态.展开行为们())
        await this.执行命名步骤(`准备给定状态：${状态行为.描述}`, async () => await 状态行为.执行(this.上下文))
    }

    let 观察记录们: 观察记录[] = []
    let 创建快照们: 快照清单[] = []
    for (let 下标 = 开始步骤下标; 下标 < 当前流程.步骤们.length; 下标 += 1) {
      let 步骤 = 当前流程.步骤们[下标]
      if (步骤 === undefined) throw new Error(`流程“${当前流程.名称}”的步骤下标越界`)
      this.允许请求快照 = true
      try {
        await this.执行命名步骤(步骤.描述, async (): Promise<void> => {
          if (步骤 instanceof 观察) {
            let 结果 = await 步骤.执行(this.上下文)
            this.检查证据策略(步骤.描述, 结果)
            观察记录们.push({ 观察描述: 步骤.描述, 结果 })
            if (!结果.通过) throw new 观察失败错误(步骤.描述, 结果)
          } else await 步骤.执行(this.上下文)
        })
      } catch (错误) {
        this.待保存快照说明们.splice(0)
        throw 错误
      } finally {
        this.允许请求快照 = false
      }
      创建快照们.push(...(await this.保存已请求快照们(当前流程, 下标 + 1, 步骤.描述)))
    }
    return {
      流程名称: 当前流程.名称,
      覆盖验收点们: 当前流程.覆盖验收点们,
      观察记录们,
      创建快照们,
      从快照恢复,
      执行步骤数量: 当前流程.步骤们.length - 开始步骤下标,
      跳过步骤数量: 开始步骤下标,
    }
  }

  private 检查依赖条件(): void {
    let 已知依赖集 = new Set(this.模型.元数据.依赖条件们)
    let 未知依赖们 = this.依赖.获得全部().filter((依赖) => !已知依赖集.has(依赖))
    if (未知依赖们.length > 0) throw new Error(`指定了项目未登记的依赖条件：${未知依赖们.map(String).join('、')}`)
  }

  private 检查证据策略(观察描述: string, 结果: 观察结果): void {
    let 允许手段们 = this.模型.元数据.证据策略?.允许手段们
    if (允许手段们 === undefined) return
    let 允许手段集 = new Set(允许手段们)
    let 越界手段们 = [...new Set(结果.证据们.map((证据值) => 证据值.手段).filter((手段) => !允许手段集.has(手段)))]
    if (越界手段们.length > 0)
      throw new Error(
        `观察“${观察描述}”使用了项目证据策略不允许的手段：${越界手段们.join('、')}；允许：${允许手段们.join('、')}`,
      )
  }

  private async 保存已请求快照们(
    当前流程: 流程<流程上下文<系统上下文, 依赖条件>, 依赖条件>,
    下一个步骤下标: number,
    默认说明: string,
  ): Promise<快照清单[]> {
    if (this.待保存快照说明们.length === 0) return []
    let 快照配置 = this.模型.元数据.快照
    if (this.快照管理器 === undefined || 快照配置 === undefined)
      throw new Error('流程请求了保存快照，但当前项目没有配置快照行为')
    let 说明们 = this.待保存快照说明们.splice(0)
    let 结果们: 快照清单[] = []
    for (let 说明 of 说明们) {
      let 清单 = await this.快照管理器.创建({
        说明: 说明 === '流程检查点' ? `${当前流程.名称} / ${默认说明}` : 说明,
        运行位置: {
          流程名称: 当前流程.名称,
          状态名称: 当前流程.给定状态.名称,
          状态行为描述们: 当前流程.给定状态.展开行为们().map((行为) => 行为.描述),
          下一个步骤下标,
          已完成步骤描述们: 当前流程.步骤们.slice(0, 下一个步骤下标).map((步骤) => 步骤.描述),
        },
        选择们: Object.fromEntries(this.选择结果.获得全部().map((赋值) => [赋值.选择.名称, 赋值.值])),
        已满足依赖们: this.依赖.获得全部().map(String),
      })
      this.日志(`已创建快照 ${清单.uuid}：${resolve(快照配置.根目录, 清单.uuid)}`)
      结果们.push(清单)
    }
    return 结果们
  }

  private 检查恢复兼容性(当前流程: 流程<流程上下文<系统上下文, 依赖条件>, 依赖条件>, 清单: 快照清单): void {
    let 位置 = 清单.运行位置
    if (位置.流程名称 !== 当前流程.名称) throw new Error(`快照属于流程“${位置.流程名称}”，不能用于“${当前流程.名称}”`)
    if (位置.状态名称 !== 当前流程.给定状态.名称)
      throw new Error(`快照给定状态为“${位置.状态名称}”，当前流程给定状态为“${当前流程.给定状态.名称}”`)
    let 当前状态行为描述们 = 当前流程.给定状态.展开行为们().map((行为) => 行为.描述)
    if (!isDeepStrictEqual(位置.状态行为描述们, 当前状态行为描述们))
      throw new Error('快照创建后，给定状态的行为定义已经变化')
    if (位置.下一个步骤下标 > 当前流程.步骤们.length) throw new Error('快照记录的流程步骤位置超出当前流程长度')
    let 当前已完成步骤描述们 = 当前流程.步骤们.slice(0, 位置.下一个步骤下标).map((步骤) => 步骤.描述)
    if (!isDeepStrictEqual(位置.已完成步骤描述们, 当前已完成步骤描述们))
      throw new Error('快照创建后，已完成的流程步骤定义或顺序已经变化')
    let 当前选择们 = Object.fromEntries(this.选择结果.获得全部().map((赋值) => [赋值.选择.名称, 赋值.值]))
    if (!isDeepStrictEqual(清单.选择们, 当前选择们)) throw new Error('快照的选择方案与本次执行不一致')
    let 当前依赖名称集 = new Set(this.依赖.获得全部().map(String))
    let 已失效依赖们 = 清单.已满足依赖们.filter((依赖) => !当前依赖名称集.has(依赖))
    if (已失效依赖们.length > 0) throw new Error(`快照依赖的条件当前不再满足：${已失效依赖们.join('、')}`)
  }
}
