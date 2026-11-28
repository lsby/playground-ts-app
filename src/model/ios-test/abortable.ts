/** 保持当前设备占用直到请求真正结束，再报告取消，避免遗留请求与下一条动作重叠。 */
export async function 在信号内等待<T>(信号: AbortSignal, 任务: Promise<T>): Promise<T> {
  let 结果 = await 任务
  信号.throwIfAborted()
  return 结果
}

/** 等待超时必须是正整数毫秒。 */
export function 检查等待超时(超时毫秒: number): void {
  if (Number.isSafeInteger(超时毫秒) === false || 超时毫秒 <= 0) throw new Error('iOS 等待超时必须是正整数')
}

/**
 * 当前这条 MCP 工具调用的取消信号（调用方超时或放弃时触发）。
 * 引擎停止后续等待与操作；已经发出的请求结束后才释放设备占用，同一时刻只有一条调用在用设备。
 */
export class 调用信号持有者 {
  private 信号: AbortSignal | undefined

  public 获得(): AbortSignal | undefined {
    return this.信号
  }

  public 设置(信号: AbortSignal): void {
    this.信号 = 信号
  }

  /** 这条调用结束时清掉；已被后面的调用替换时不动，避免冲掉新调用的信号。 */
  public 清除(信号: AbortSignal): void {
    if (this.信号 === 信号) this.信号 = undefined
  }

  /** 会话级取消信号加上当前调用的取消信号。 */
  public 合并(会话信号: AbortSignal): AbortSignal {
    return this.信号 === undefined ? 会话信号 : AbortSignal.any([会话信号, this.信号])
  }
}
