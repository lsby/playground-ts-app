export let 默认并发数 = 4

export async function 并发执行<T>(项组: T[], 并发数: number, 处理: (项: T) => Promise<void>): Promise<void> {
  if (Number.isInteger(并发数) === false || 并发数 < 1 || 并发数 > 64) throw new Error('并发数必须是 1 到 64 的整数')
  let 下一个 = 0
  let 失败: { 错误: unknown } | undefined
  async function 工人(): Promise<void> {
    while (失败 === undefined && 下一个 < 项组.length) {
      let 项 = 项组[下一个]
      下一个 += 1
      if (项 === undefined) continue
      try {
        await 处理(项)
      } catch (错误) {
        失败 ??= { 错误 }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(并发数, 项组.length) }, () => 工人()))
  if (失败 !== undefined) throw 失败.错误
}
