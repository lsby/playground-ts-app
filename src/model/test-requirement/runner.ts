import { 流程, 状态, 行为, 观察, type 证据, type 验收点 } from './model'

export type 运行步骤阶段 = '流程步骤'
export type 运行步骤描述 = {
  名称: string
  阶段: 运行步骤阶段
  类型: '行为' | '观察'
  状态: '通过' | '失败'
  开始时间: string
  结束时间: string
  耗时毫秒: number
  证据们: readonly 证据[]
  错误?: string | undefined
}
export type 观察描述 = { 观察: string; 证据们: readonly 证据[] }
export type 流程运行描述<系统状态 extends object> = {
  流程: 流程<系统状态>
  最终状态: 状态<系统状态>
  状态: '通过' | '失败'
  开始时间: string
  结束时间: string
  耗时毫秒: number
  步骤们: readonly 运行步骤描述[]
  观察们: readonly 观察描述[]
  证据们: readonly 证据[]
  证明验收点们: readonly 验收点[]
  日志们: readonly string[]
  错误?: string | undefined
}

/**
 * 运行器负责把一个流程真正作用于给定的初始状态。
 * 它持有本次运行的初始状态，依次执行行为和观察，并返回日志、证据、结果与最终状态组成的运行描述。
 */
export class 运行器<系统状态 extends object> {
  private readonly 初始状态: 状态<系统状态>
  public constructor(初始状态: 状态<系统状态>) {
    this.初始状态 = 初始状态
  }
  public async 运行(当前流程: 流程<系统状态>): Promise<流程运行描述<系统状态>> {
    let 开始时间戳 = Date.now()
    let 步骤们: 运行步骤描述[] = []
    let 观察们: 观察描述[] = []
    let 证据们: 证据[] = []
    let 日志们: string[] = []
    let 失败错误: unknown
    let 当前状态 = this.初始状态
    try {
      for (let 步骤 of 当前流程.获得步骤们()) {
        if (步骤 instanceof 行为) 当前状态 = await this.执行行为步骤(步骤, 当前状态, 步骤们, 日志们)
        else if (步骤 instanceof 观察) {
          let 当前证据们 = await this.执行观察步骤(步骤, 当前状态, 步骤们, 日志们)
          观察们.push({ 观察: 步骤.获得描述(), 证据们: 当前证据们 })
          证据们.push(...当前证据们)
        }
      }
    } catch (错误) {
      失败错误 = 错误
    }
    let 结束时间戳 = Date.now()
    return {
      流程: 当前流程,
      最终状态: 当前状态,
      状态: 失败错误 === undefined ? '通过' : '失败',
      开始时间: new Date(开始时间戳).toISOString(),
      结束时间: new Date(结束时间戳).toISOString(),
      耗时毫秒: 结束时间戳 - 开始时间戳,
      步骤们,
      观察们,
      证据们,
      证明验收点们: 失败错误 === undefined ? 当前流程.获得覆盖验收点们() : [],
      日志们,
      ...(失败错误 === undefined ? {} : { 错误: this.格式化错误(失败错误) }),
    }
  }
  private async 执行行为步骤(
    当前行为: 行为<系统状态>,
    当前状态: 状态<系统状态>,
    步骤们: 运行步骤描述[],
    日志们: string[],
  ): Promise<状态<系统状态>> {
    let 迁移后状态: 状态<系统状态> | undefined
    await this.记录步骤(
      当前行为.获得描述(),
      '流程步骤',
      '行为',
      async (): Promise<readonly 证据[]> => {
        迁移后状态 = await 当前状态.迁移(当前行为)
        return []
      },
      步骤们,
      日志们,
    )
    if (迁移后状态 === undefined) throw new Error(`行为“${当前行为.获得描述()}”未产生迁移后状态`)
    return 迁移后状态
  }
  private async 执行观察步骤(
    当前观察: 观察<系统状态>,
    当前状态: 状态<系统状态>,
    步骤们: 运行步骤描述[],
    日志们: string[],
  ): Promise<readonly 证据[]> {
    return await this.记录步骤(
      当前观察.获得描述(),
      '流程步骤',
      '观察',
      async (): Promise<readonly 证据[]> => await 当前观察.验证(当前状态.读取()),
      步骤们,
      日志们,
    )
  }
  private async 记录步骤(
    名称: string,
    阶段: 运行步骤阶段,
    类型: 运行步骤描述['类型'],
    执行: () => Promise<readonly 证据[]>,
    步骤们: 运行步骤描述[],
    日志们: string[],
  ): Promise<readonly 证据[]> {
    let 开始时间戳 = Date.now()
    日志们.push(`开始：${名称}`)
    try {
      let 当前证据们 = await 执行()
      let 结束时间戳 = Date.now()
      步骤们.push({
        名称,
        阶段,
        类型,
        状态: '通过',
        开始时间: new Date(开始时间戳).toISOString(),
        结束时间: new Date(结束时间戳).toISOString(),
        耗时毫秒: 结束时间戳 - 开始时间戳,
        证据们: 当前证据们,
      })
      日志们.push(`通过：${名称}`)
      return 当前证据们
    } catch (错误) {
      let 结束时间戳 = Date.now()
      let 错误文本 = this.格式化错误(错误)
      步骤们.push({
        名称,
        阶段,
        类型,
        状态: '失败',
        开始时间: new Date(开始时间戳).toISOString(),
        结束时间: new Date(结束时间戳).toISOString(),
        耗时毫秒: 结束时间戳 - 开始时间戳,
        证据们: [],
        错误: 错误文本,
      })
      日志们.push(`失败：${名称}：${错误文本}`)
      throw 错误
    }
  }
  private 格式化错误(错误: unknown): string {
    return 错误 instanceof Error ? (错误.stack ?? 错误.message) : String(错误)
  }
}
