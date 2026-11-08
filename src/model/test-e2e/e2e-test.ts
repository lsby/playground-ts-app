import type { 浏览器测试引擎 } from '../browser-test'

export type 端到端测试步骤 = {
  名称: string
  类型: '准备' | '导航' | '操作' | '断言' | '操作与断言'
  执行: (引擎: 浏览器测试引擎) => Promise<void>
}

/**
 * 端到端测试是一项可独立执行的浏览器场景验证。
 * 用例预先声明有序的主流程步骤，并在执行计划的首步准备测试数据。
 */
export abstract class 端到端测试 {
  public 获得执行步骤(): readonly 端到端测试步骤[] {
    let 主流程步骤们 = this.获得主流程步骤()
    if (主流程步骤们.length === 0) throw new Error('端到端测试必须声明主流程步骤')
    if (主流程步骤们.some((步骤) => 步骤.名称.trim() === '')) throw new Error('端到端测试步骤名称不能为空')
    return [{ 名称: '准备测试数据', 类型: '准备', 执行: (): Promise<void> => this.准备数据() }, ...主流程步骤们]
  }

  public abstract 准备数据(): Promise<void>
  protected abstract 获得主流程步骤(): readonly 端到端测试步骤[]
}
