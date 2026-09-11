export function 创建中止错误(信号: AbortSignal): unknown {
  return 信号.reason ?? new DOMException('操作已取消', 'AbortError')
}

export function 是中止错误(错误: unknown, 信号?: AbortSignal): boolean {
  if (信号?.aborted === true && 错误 === 信号.reason) return true
  return 错误 instanceof DOMException && 错误.name === 'AbortError'
}

export function 等待可取消任务<结果类型>(任务: Promise<结果类型>, 信号?: AbortSignal): Promise<结果类型> {
  if (信号 === undefined) return 任务
  if (信号.aborted === true) return Promise.reject(创建中止错误(信号))

  return new Promise<结果类型>((resolve, reject): void => {
    let 取消 = (): void => {
      reject(创建中止错误(信号))
    }
    信号.addEventListener('abort', 取消, { once: true })
    void 任务.then(resolve, reject).finally((): void => {
      信号.removeEventListener('abort', 取消)
    })
  })
}
