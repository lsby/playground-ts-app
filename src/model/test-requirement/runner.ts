import { 流程, 流程步骤附件列表模型, 状态, 行为, type 提交步骤附件, type 流程步骤附件, type 验收点 } from './model'

export type 流程运行错误 = {
  文本: string
  消息?: string
  预期值?: string
  实际值?: string
  位置?: { 行: number; 列: number }
}

type 执行时段 = { 开始时间: string; 结束时间: string; 耗时毫秒: number }
type 步骤标识 = { 名称: string; 类型: '准备' | '行为' | '观察' }
type 已执行步骤 = 步骤标识 &
  执行时段 & {
    状态: '通过' | '失败' | '中断'
    附件组们: readonly (readonly 流程步骤附件[])[]
    取证错误们: readonly 流程运行错误[]
    错误?: 流程运行错误
  }
export type 运行步骤描述 = (步骤标识 & { 状态: '未执行' }) | 已执行步骤
export type 流程运行描述<系统状态 extends object> = 执行时段 & {
  流程: 流程<系统状态>
  最终状态: 状态<系统状态> | undefined
  状态: '通过' | '失败' | '中断'
  步骤们: readonly 运行步骤描述[]
  证明验收点们: readonly 验收点[]
  日志们: readonly string[]
  错误?: 流程运行错误
}

export type 流程运行配置 = {
  取消信号: AbortSignal
  执行步骤: <结果>(提交: 提交步骤附件, 记录错误: (错误: unknown) => void, 执行: () => Promise<结果>) => Promise<结果>
  格式化错误: (错误: unknown) => 流程运行错误
}

function 计算时段(开始: number): 执行时段 {
  let 结束 = Date.now()
  return { 开始时间: new Date(开始).toISOString(), 结束时间: new Date(结束).toISOString(), 耗时毫秒: 结束 - 开始 }
}

/**
 * 运行器在每次尝试时准备初始状态，依次执行行为和观察，并记录步骤的结果与附件。
 */
export class 运行器<系统状态 extends object> {
  public constructor(
    private readonly 准备初始状态: () => Promise<状态<系统状态>>,
    private readonly 配置: 流程运行配置,
  ) {}

  public async 运行(当前流程: 流程<系统状态>): Promise<流程运行描述<系统状态>> {
    let 开始 = Date.now()
    let 流程步骤们 = 当前流程.获得步骤们()
    let 步骤们: 运行步骤描述[] = [
      { 名称: '准备数据', 类型: '准备', 状态: '未执行' },
      ...流程步骤们.map(
        (步骤): 运行步骤描述 => ({
          名称: 步骤.获得描述(),
          类型: 步骤 instanceof 行为 ? '行为' : '观察',
          状态: '未执行',
        }),
      ),
    ]
    let 日志们: string[] = []
    let 当前状态: 状态<系统状态> | undefined
    let 错误详情: 流程运行错误 | undefined
    let 运行步骤 = async <结果>(索引: number, 执行: (提交: 提交步骤附件) => Promise<结果>): Promise<结果> => {
      let 步骤 = 步骤们[索引]
      if (步骤 === undefined) throw new Error(`流程步骤索引越界：${String(索引)}`)
      this.配置.取消信号.throwIfAborted()
      日志们.push(`开始：${步骤.名称}`)
      return await this.记录步骤(步骤, 执行, (记录) => {
        步骤们[索引] = 记录
        错误详情 = 记录.错误
        日志们.push(
          记录.错误 === undefined ? `${记录.状态}：${记录.名称}` : `${记录.状态}：${记录.名称}：${记录.错误.文本}`,
        )
      })
    }
    try {
      let 已知状态 = await 运行步骤(0, this.准备初始状态)
      当前状态 = 已知状态
      for (let [索引, 步骤] of 流程步骤们.entries()) {
        if (步骤 instanceof 行为) {
          已知状态 = await 运行步骤(索引 + 1, (提交) => 已知状态.迁移(步骤, 提交))
          当前状态 = 已知状态
        } else {
          await 运行步骤(索引 + 1, (提交) => 步骤.验证(已知状态.读取(), 提交))
        }
      }
      this.配置.取消信号.throwIfAborted()
    } catch (错误) {
      错误详情 ??= this.配置.格式化错误(错误)
    }
    let 运行状态: 流程运行描述<系统状态>['状态'] = this.配置.取消信号.aborted
      ? '中断'
      : 错误详情 === undefined
        ? '通过'
        : '失败'
    return {
      ...计算时段(开始),
      流程: 当前流程,
      最终状态: 当前状态,
      状态: 运行状态,
      步骤们,
      证明验收点们: 运行状态 === '通过' ? 当前流程.获得覆盖验收点们() : [],
      日志们,
      ...(错误详情 === undefined ? {} : { 错误: 错误详情 }),
    }
  }

  private async 记录步骤<结果>(
    步骤: 步骤标识,
    执行: (提交: 提交步骤附件) => Promise<结果>,
    记录: (步骤: 已执行步骤) => void,
  ): Promise<结果> {
    let 开始 = Date.now()
    let 附件组们: 流程步骤附件[][] = []
    let 取证错误们: 流程运行错误[] = []
    let 提交: 提交步骤附件 = (提交内容, 选项) => {
      let 附件们 = 流程步骤附件列表模型.parse(提交内容)
      if (附件们.length === 0) return
      let 上一组 = 附件组们.at(-1)
      if (选项?.并入上一组 === true && 上一组 !== undefined) 上一组.push(...附件们)
      else 附件组们.push(附件们)
    }
    let 记录取证错误 = (错误: unknown): void => {
      取证错误们.push(this.配置.格式化错误(错误))
    }
    try {
      let 执行结果 = await this.配置.执行步骤(提交, 记录取证错误, () => 执行(提交))
      this.配置.取消信号.throwIfAborted()
      记录({
        ...步骤,
        ...计算时段(开始),
        状态: '通过',
        附件组们: 附件组们.map((组) => [...组]),
        取证错误们: [...取证错误们],
      })
      return 执行结果
    } catch (错误) {
      记录({
        ...步骤,
        ...计算时段(开始),
        状态: this.配置.取消信号.aborted ? '中断' : '失败',
        附件组们: 附件组们.map((组) => [...组]),
        取证错误们: [...取证错误们],
        错误: this.配置.格式化错误(错误),
      })
      throw 错误
    }
  }
}
