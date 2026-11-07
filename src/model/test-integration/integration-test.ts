/**
 * 集成测试是一项具有明确目标、可以独立执行的组合行为验证。
 * 它以名称标识自身，具体测试负责准备所需状态并检查业务结果。
 * 调用运行方法即可执行验证，失败通过异常交给调用方处理。
 */
export abstract class 集成测试 {
  private readonly 名称: string

  protected constructor(名称: string) {
    let 有效名称 = 名称.trim()
    if (有效名称 === '') throw new Error('集成测试名称不能为空')
    this.名称 = 有效名称
  }

  public 获得名称(): string {
    return this.名称
  }

  public abstract 运行(附加参数们: readonly string[]): Promise<void>
}
