import { spawn } from 'node:child_process'

/** 调用 xcrun，返回标准输出；非 0 退出码、超时和取消都会报错。 */
export async function 执行Xcrun(参数: readonly string[], 取消信号: AbortSignal, 超时毫秒 = 120_000): Promise<Buffer> {
  if (Number.isSafeInteger(超时毫秒) === false || 超时毫秒 <= 0) throw new Error('xcrun 超时必须是正整数')
  取消信号.throwIfAborted()
  let 信号 = AbortSignal.any([取消信号, AbortSignal.timeout(超时毫秒)])
  return await new Promise<Buffer>((完成, 失败): void => {
    let 进程 = spawn('xcrun', [...参数], { signal: 信号, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'] })
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

/** 从 `simctl spawn <设备> launchctl list` 的输出里找包名对应应用的进程号；应用没在运行（进程号列是 -）返回 undefined。 */
export function 解析应用进程号(launchctl输出: string, 包名: string): number | undefined {
  for (let 行 of launchctl输出.split('\n')) {
    let 列们 = 行.trim().split(/\s+/u)
    let 标签 = 列们[2]
    if (标签 === undefined || 标签.startsWith(`UIKitApplication:${包名}[`) === false) continue
    let 进程号 = Number(列们[0])
    if (Number.isSafeInteger(进程号) && 进程号 > 0) return 进程号
  }
  return undefined
}

/** 读取模拟器里某个应用当前运行的进程号，没在运行返回 undefined。 */
export async function 读取应用进程号(设备: string, 包名: string, 取消信号: AbortSignal): Promise<number | undefined> {
  let 输出 = await 执行Xcrun(['simctl', 'spawn', 设备, 'launchctl', 'list'], 取消信号, 30_000)
  return 解析应用进程号(输出.toString('utf8'), 包名)
}

/** 找原生输入框（网页里的输入框获得焦点时也以原生输入框出现在无障碍树里）。 */
export let 输入框查询 = {
  using: '-ios predicate string',
  value:
    "type IN {'XCUIElementTypeTextField', 'XCUIElementTypeSecureTextField', 'XCUIElementTypeTextView', 'XCUIElementTypeSearchField'}",
}

/** 本机进程是否还活着（模拟器里的应用进程也是本机进程）。没权限发信号说明进程在，只有找不到进程才算已退出。 */
export function 进程存活(进程号: number): boolean {
  try {
    process.kill(进程号, 0)
    return true
  } catch (错误) {
    return 错误 instanceof Error && 'code' in 错误 && 错误.code === 'EPERM'
  }
}
