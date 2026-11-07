import { 流程, 状态, 需求, type 流程步骤 } from './model'
import { 运行器, type 流程运行描述 } from './runner'

export type 需求测试运行参数 = { 服务地址: string; 附件目录: string; 流程序号: number }
export type 需求测试附件 = { 名称: string; 路径: string; 内容类型?: string | undefined }
export type 需求测试结果 = Omit<流程运行描述<object>, '流程' | '最终状态'> & { 附件们: readonly 需求测试附件[] }
export type 需求测试会话<上下文 extends object> = {
  上下文: 上下文
  收集附件: () => Promise<readonly 需求测试附件[]>
  关闭: () => Promise<void>
}
export type 需求测试流程 = Pick<流程<object>, '获得名称' | '获得覆盖验收点们' | '包含人工验收'> & {
  获得步骤们: () => readonly 流程步骤[]
}

/**
 * 需求测试是一组共享上下文准备方式的需求与流程。
 * 实例持有需求与流程，按名称执行其中一条流程，并负责该次运行的附件和资源释放。
 */
export abstract class 需求测试<上下文 extends object> {
  private readonly 需求们: readonly 需求[]
  private readonly 流程们: readonly 流程<上下文>[]

  protected constructor(需求们: readonly 需求[], 流程们: readonly 流程<上下文>[]) {
    if (需求们.length === 0 || 需求们.some((值) => 值 instanceof 需求 === false))
      throw new Error('需求测试必须登记有效的需求')
    if (流程们.length === 0 || 流程们.some((值) => 值 instanceof 流程 === false))
      throw new Error('需求测试必须登记有效的流程')
    if (new Set(流程们.map((值) => 值.获得名称())).size !== 流程们.length) throw new Error('需求测试包含重复流程名称')
    this.需求们 = [...需求们]
    this.流程们 = [...流程们]
  }

  public 获得需求们(): readonly 需求[] {
    return [...this.需求们]
  }

  public 获得流程们(): readonly 需求测试流程[] {
    return [...this.流程们]
  }

  public async 运行(流程名称: string, 参数: 需求测试运行参数): Promise<需求测试结果> {
    let 当前流程 = this.流程们.find((值) => 值.获得名称() === 流程名称)
    if (当前流程 === undefined) throw new Error(`找不到指定的流程场景：${流程名称}`)
    let 会话 = await this.准备上下文(参数)
    try {
      let { 流程: _流程, 最终状态: _最终状态, ...描述 } = await new 运行器(new 状态(会话.上下文)).运行(当前流程)
      return { ...描述, 附件们: await 会话.收集附件() }
    } finally {
      await 会话.关闭()
    }
  }

  protected abstract 准备上下文(参数: 需求测试运行参数): Promise<需求测试会话<上下文>>
}
