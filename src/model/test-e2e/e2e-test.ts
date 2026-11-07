import type { 浏览器测试引擎 } from '../browser-test'

/**
 * 端到端测试是一项可独立执行的浏览器场景验证。
 * 每个用例负责准备所需的数据和验证主流程，运行时按固定顺序执行两个阶段。
 */
export abstract class 端到端测试 {
  public async 运行(引擎: 浏览器测试引擎): Promise<void> {
    await this.准备数据()
    await this.主流程(引擎)
  }

  public abstract 准备数据(): Promise<void>
  public abstract 主流程(引擎: 浏览器测试引擎): Promise<void>
}
