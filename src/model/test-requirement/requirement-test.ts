import { 流程, 状态, 需求, type 可等待结果, type 流程步骤 } from './model'
import { 运行器, type 流程运行描述, type 流程运行配置 } from './runner'
import type { 需求测试工具 } from './tools'

export type 需求测试上下文<业务数据 extends object = object> = 业务数据 & { 工具: 需求测试工具 }
export type 需求测试运行参数 = 流程运行配置 & { 工具: 需求测试工具 }
export type 需求测试附件 = { 名称: string; 路径: string; 内容类型?: string | undefined }
export type 需求测试结果 = Omit<流程运行描述<object>, '流程' | '最终状态'>
export type 需求测试流程 = Pick<流程<object>, '获得名称' | '获得说明' | '获得覆盖验收点们' | '包含人工验收'> & {
  获得步骤们: () => readonly 流程步骤[]
}

/**
 * 需求测试是一组共享数据准备方式的需求与流程。
 * 实例持有需求与流程，按名称执行其中一条流程。
 */
export abstract class 需求测试<业务数据 extends object = object> {
  private readonly 需求们: readonly 需求[]
  private readonly 流程们: readonly 流程<需求测试上下文<业务数据>>[]
  private readonly 使用测试服务: boolean

  protected constructor(
    需求们: readonly 需求[],
    流程们: readonly 流程<需求测试上下文<业务数据>>[],
    配置: { 使用测试服务: boolean },
  ) {
    if (需求们.length === 0 || 需求们.some((值) => 值 instanceof 需求 === false))
      throw new Error('需求测试必须登记有效的需求')
    if (流程们.length === 0 || 流程们.some((值) => 值 instanceof 流程 === false))
      throw new Error('需求测试必须登记有效的流程')
    if (new Set(流程们.map((值) => 值.获得名称())).size !== 流程们.length) throw new Error('需求测试包含重复流程名称')
    this.需求们 = [...需求们]
    this.流程们 = [...流程们]
    this.使用测试服务 = 配置.使用测试服务
  }

  public 获得需求们(): readonly 需求[] {
    return [...this.需求们]
  }

  public 获得流程们(): readonly 需求测试流程[] {
    return [...this.流程们]
  }

  public 需要测试服务(): boolean {
    return this.使用测试服务
  }

  public async 运行(流程名称: string, 参数: 需求测试运行参数): Promise<需求测试结果> {
    let 当前流程 = this.流程们.find((值) => 值.获得名称() === 流程名称)
    if (当前流程 === undefined) throw new Error(`找不到指定的流程场景：${流程名称}`)
    let 初始化 = async (): Promise<状态<需求测试上下文<业务数据>>> => {
      let 数据 = await this.准备数据(参数.工具)
      if ('工具' in 数据) throw new Error('准备数据返回值不能包含保留字段“工具”')
      return new 状态<需求测试上下文<业务数据>>({ ...数据, 工具: 参数.工具 })
    }
    let { 流程: _流程, 最终状态: _最终状态, ...描述 } = await new 运行器(初始化, 参数).运行(当前流程)
    return 描述
  }

  protected abstract 准备数据(工具: 需求测试工具): 可等待结果<业务数据>
}
