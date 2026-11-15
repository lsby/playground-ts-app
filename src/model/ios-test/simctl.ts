import { spawn } from 'node:child_process'

/** 调用 xcrun，返回标准输出；非 0 退出码、超时和取消都会报错。 */
export async function 执行Xcrun(参数: readonly string[], 取消信号: AbortSignal, 超时毫秒 = 120_000): Promise<Buffer> {
  if (Number.isSafeInteger(超时毫秒) === false || 超时毫秒 <= 0) throw new Error('xcrun 超时必须是正整数')
  取消信号.throwIfAborted()
  let 信号 = AbortSignal.any([取消信号, AbortSignal.timeout(超时毫秒)])
  return await new Promise<Buffer>((完成, 失败): void => {
    let 进程 = spawn('xcrun', [...参数], { signal: 信号, stdio: ['ignore', 'pipe', 'pipe'] })
    let 输出: Buffer[] = []
    let 错误输出: Buffer[] = []
    进程.stdout.on('data', (数据: Buffer): void => void 输出.push(数据))
    进程.stderr.on('data', (数据: Buffer): void => void 错误输出.push(数据))
    进程.once('error', 失败)
    进程.once('close', (退出码, 信号名称): void => {
      if (信号.aborted) {
        失败(new Error('xcrun 操作已取消或超时', { cause: 信号.reason }))
        return
      }
      if (退出码 !== 0) {
        失败(
          new Error(
            `xcrun ${参数.join(' ')} 执行失败（退出码 ${String(退出码)}，信号 ${String(信号名称)}）：${Buffer.concat(错误输出).toString('utf8').trim()}`,
          ),
        )
        return
      }
      完成(Buffer.concat(输出))
    })
  })
}

export async function 读取模拟器状态(设备: string, 取消信号: AbortSignal): Promise<string | undefined> {
  let 输出 = JSON.parse((await 执行Xcrun(['simctl', 'list', 'devices', '--json'], 取消信号)).toString('utf8')) as {
    devices: Record<string, { udid: string; state: string }[]>
  }
  return Object.values(输出.devices)
    .flat()
    .find((候选) => 候选.udid === 设备)?.state
}

/** 只给被测包设置系统语言（App 启动时读设备语言），不动模拟器全局设置。不指定时清掉上次写入的值，恢复跟随模拟器语言。 */
export async function 设置应用语言(
  设备: string,
  包名: string,
  语言: 'zh-CN' | 'en-US' | undefined,
  取消信号: AbortSignal,
): Promise<void> {
  if (语言 === undefined) {
    // 写在模拟器里，卸载 App 不会清掉
    for (let 键 of ['AppleLanguages', 'AppleLocale']) {
      try {
        await 执行Xcrun(['simctl', 'spawn', 设备, 'defaults', 'delete', 包名, 键], 取消信号)
      } catch {
        // 本来就没写过时 delete 会报错，可忽略。
      }
    }
    return
  }
  let 语言码 = 语言 === 'en-US' ? 'en' : 'zh-Hans'
  let 地区码 = 语言 === 'en-US' ? 'en_US' : 'zh_CN'
  await 执行Xcrun(['simctl', 'spawn', 设备, 'defaults', 'write', 包名, 'AppleLanguages', '-array', 语言码], 取消信号)
  await 执行Xcrun(['simctl', 'spawn', 设备, 'defaults', 'write', 包名, 'AppleLocale', 地区码], 取消信号)
}

/** 找原生输入框（网页里的输入框获得焦点时也以原生输入框出现在无障碍树里）。 */
export let 输入框查询 = {
  using: '-ios predicate string',
  value:
    "type IN {'XCUIElementTypeTextField', 'XCUIElementTypeSecureTextField', 'XCUIElementTypeTextView', 'XCUIElementTypeSearchField'}",
}
