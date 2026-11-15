import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as 等待 } from 'node:timers/promises'

import { 获得Appium目录, type Appium配置 } from './appium-dir'

// Appium 服务和 WebDriverAgent（WDA）常驻：dev:test 退出后保留，下次直接复用，省掉每次约半分钟的启动。
// 状态文件和日志都在 <Appium目录>/resident/，用 `ios:appium:stop` 停止。
// 复用前核对：Appium 版本、驱动目录（APPIUM_HOME）一致才复用，不一致先停掉重启；WDA 按模拟器各一个，端口由 UDID 算出。

type 常驻状态 = {
  appium?: { pid: number; 端口: number; 版本: string; 驱动目录: string }
  wda: Record<string, { pid: number; 端口: number }>
}

export function 创建Appium常驻管理器(配置: Appium配置): {
  获得常驻目录: () => string
  确保Appium常驻: (取消信号: AbortSignal) => Promise<string>
  确保WDA常驻: (设备: string, 取消信号: AbortSignal) => Promise<string>
  停止全部常驻服务: () => Promise<string[]>
} {
  function 获得常驻目录(): string {
    return path.join(获得Appium目录(配置), 'resident')
  }

  function 状态文件(): string {
    return path.join(获得常驻目录(), 'state.json')
  }

  function 读取状态(): 常驻状态 {
    try {
      let 状态 = JSON.parse(fs.readFileSync(状态文件(), 'utf8')) as Partial<常驻状态>
      return { ...(状态.appium === undefined ? {} : { appium: 状态.appium }), wda: 状态.wda ?? {} }
    } catch {
      return { wda: {} }
    }
  }

  function 写入状态(状态: 常驻状态): void {
    fs.mkdirSync(获得常驻目录(), { recursive: true })
    fs.writeFileSync(状态文件(), JSON.stringify(状态, null, 2))
  }

  function 进程存活(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  function 获得Appium端口(): number {
    let 值 = 配置.端口
    if (Number.isInteger(值) === false || 值 < 1024 || 值 > 65535) throw new Error('Appium 端口必须是有效端口')
    return 值
  }

  function 计算WDA端口(设备: string): number {
    let 数 = Number.parseInt(设备.replaceAll('-', '').slice(0, 6), 16)
    return 8100 + (数 % 800)
  }

  function 读取Appium版本(): string {
    let 文件 = path.join(获得Appium目录(配置), 'node_modules/appium/package.json')
    return (JSON.parse(fs.readFileSync(文件, 'utf8')) as { version: string }).version
  }

  function 获得驱动目录(): string {
    return 配置.驱动目录
  }

  async function 探测(地址: string, 超时毫秒 = 2_000): Promise<boolean> {
    try {
      return (await fetch(`${地址}/status`, { signal: AbortSignal.timeout(超时毫秒) })).ok
    } catch {
      return false
    }
  }

  async function 等待端口空闲(地址: string): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
      if ((await 探测(地址, 500)) === false) return
      await 等待(300)
    }
  }

  async function 结束进程(pid: number): Promise<void> {
    if (进程存活(pid) === false) return
    try {
      process.kill(process.platform === 'win32' ? pid : -pid, 'SIGTERM')
    } catch {
      return
    }
    for (let i = 0; i < 25 && 进程存活(pid); i += 1) await 等待(200)
    if (进程存活(pid)) {
      try {
        process.kill(process.platform === 'win32' ? pid : -pid, 'SIGKILL')
      } catch {
        // 已经退出
      }
    }
  }

  async function 持锁执行<T>(任务: () => Promise<T>): Promise<T> {
    fs.mkdirSync(获得常驻目录(), { recursive: true })
    let 锁文件 = path.join(获得常驻目录(), 'start.lock')
    let 截止 = Date.now() + 600_000
    while (true) {
      try {
        fs.writeFileSync(锁文件, String(process.pid), { flag: 'wx' })
        break
      } catch {
        // 持锁进程已死或锁太旧就接管
        try {
          let 持有者 = Number(fs.readFileSync(锁文件, 'utf8'))
          if (Number.isInteger(持有者) === false || 进程存活(持有者) === false) fs.rmSync(锁文件, { force: true })
        } catch {
          // 刚好被释放
        }
        if (Date.now() > 截止) throw new Error('等待 Appium 常驻服务启动锁超时')
        await 等待(300)
      }
    }
    try {
      return await 任务()
    } finally {
      fs.rmSync(锁文件, { force: true })
    }
  }

  function 启动脱离进程(程序: string, 参数: string[], 日志文件: string, 环境: NodeJS.ProcessEnv): ChildProcess {
    fs.mkdirSync(path.dirname(日志文件), { recursive: true })
    let 日志 = fs.openSync(日志文件, 'a')
    fs.writeSync(日志, `\n===== ${new Date().toISOString()} 启动 ${程序} ${参数.join(' ')} =====\n`)
    let 进程 = spawn(程序, 参数, { detached: true, windowsHide: true, stdio: ['ignore', 日志, 日志], env: 环境 })
    进程.unref()
    fs.closeSync(日志)
    return 进程
  }

  /** 确保常驻 Appium 在跑且版本、驱动目录一致，返回服务地址。 */
  async function 确保Appium常驻(取消信号: AbortSignal): Promise<string> {
    let 端口 = 获得Appium端口()
    let 地址 = `http://127.0.0.1:${String(端口)}`
    let 版本 = 读取Appium版本()
    let 驱动目录 = 获得驱动目录()
    return await 持锁执行(async (): Promise<string> => {
      let 状态 = 读取状态()
      let 在跑 = await 探测(地址)
      if (在跑 && 状态.appium?.版本 === 版本 && 状态.appium.驱动目录 === 驱动目录 && 状态.appium.端口 === 端口)
        return 地址
      // 不一致（或不是我们起的）：先停掉旧的再重启
      if (状态.appium !== undefined) await 结束进程(状态.appium.pid)
      if (await 探测(地址))
        throw new Error(`端口 ${String(端口)} 上有不是本框架启动的 Appium，请先停掉它，或用 项目移动测试配置换端口`)
      let 进程 = 启动脱离进程(
        path.join(获得Appium目录(配置), 'node_modules/.bin/appium'),
        ['server', '--address', '127.0.0.1', '--port', String(端口), '--log-level', 配置.日志级别],
        path.join(获得常驻目录(), 'appium.log'),
        { ...process.env, APPIUM_HOME: 驱动目录 },
      )
      if (进程.pid === undefined) throw new Error('Appium 启动失败')
      写入状态({ ...状态, appium: { pid: 进程.pid, 端口, 版本, 驱动目录 } })
      let 截止 = Date.now() + 60_000
      while ((await 探测(地址)) === false) {
        取消信号.throwIfAborted()
        if (进程.exitCode !== null || Date.now() > 截止)
          throw new Error(`Appium 未能启动，日志：${path.join(获得常驻目录(), 'appium.log')}`)
        await 等待(300, undefined, { signal: 取消信号 })
      }
      return 地址
    })
  }

  function 读取模拟器系统版本(设备: string): string {
    let 输出 = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', '--json'], { encoding: 'utf8' })) as {
      devices: Record<string, { udid: string }[]>
    }
    for (let [运行时, 列表] of Object.entries(输出.devices)) {
      if (列表.some((项) => 项.udid === 设备) === false) continue
      let 匹配 = /iOS-(\d+)-(\d+)/u.exec(运行时)
      if (匹配 !== null) return `${匹配[1] ?? ''}.${匹配[2] ?? ''}`
    }
    throw new Error(`找不到模拟器 ${设备} 的系统版本`)
  }

  function 找WDA工程(): string {
    let 驱动目录 = 获得驱动目录()
    let 候选 = path.join(
      驱动目录,
      'node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent/WebDriverAgent.xcodeproj',
    )
    if (fs.existsSync(候选) === false) throw new Error(`找不到 WebDriverAgent 工程：${候选}`)
    return 候选
  }

  /** 确保这台模拟器上的 WebDriverAgent 常驻并就绪，返回它的地址（给 Appium 的 webDriverAgentUrl 用）。 */
  async function 确保WDA常驻(设备: string, 取消信号: AbortSignal): Promise<string> {
    let 端口 = 计算WDA端口(设备)
    let 地址 = `http://127.0.0.1:${String(端口)}`
    return await 持锁执行(async (): Promise<string> => {
      if (await 探测(地址)) return 地址
      let 状态 = 读取状态()
      let 旧 = 状态.wda[设备]
      if (旧 !== undefined) await 结束进程(旧.pid)
      let 进程 = 启动脱离进程(
        'xcodebuild',
        [
          'build-for-testing',
          'test-without-building',
          '-project',
          找WDA工程(),
          '-scheme',
          'WebDriverAgentRunner',
          '-derivedDataPath',
          path.join(获得Appium目录(配置), 'wda'),
          '-destination',
          `id=${设备}`,
          `IPHONEOS_DEPLOYMENT_TARGET=${读取模拟器系统版本(设备)}`,
          'GCC_TREAT_WARNINGS_AS_ERRORS=0',
          'COMPILER_INDEX_STORE_ENABLE=NO',
          `USE_PORT=${String(端口)}`,
          'MOBILE_TEST_RESIDENT_WDA=1',
        ],
        path.join(获得常驻目录(), `wda-${设备}.log`),
        process.env,
      )
      if (进程.pid === undefined) throw new Error('WebDriverAgent 启动失败')
      写入状态({ ...读取状态(), wda: { ...读取状态().wda, [设备]: { pid: 进程.pid, 端口 } } })
      let 截止 = Date.now() + 600_000
      while ((await 探测(地址)) === false) {
        取消信号.throwIfAborted()
        if (进程.exitCode !== null || Date.now() > 截止)
          throw new Error(`WebDriverAgent 未能启动，日志：${path.join(获得常驻目录(), `wda-${设备}.log`)}`)
        await 等待(500, undefined, { signal: 取消信号 })
      }
      return 地址
    })
  }

  /** 停止全部常驻服务（Appium、各模拟器的 WebDriverAgent）。 */
  async function 停止全部常驻服务(): Promise<string[]> {
    let 结果: string[] = []
    let 状态 = 读取状态()
    if (状态.appium !== undefined && 进程存活(状态.appium.pid)) {
      await 结束进程(状态.appium.pid)
      结果.push(`已停止 Appium（pid ${String(状态.appium.pid)}）`)
    }
    for (let [设备, 项] of Object.entries(状态.wda)) {
      if (进程存活(项.pid) === false) continue
      await 结束进程(项.pid)
      结果.push(`已停止 WebDriverAgent（${设备}，pid ${String(项.pid)}）`)
    }
    fs.rmSync(状态文件(), { force: true })
    await 等待端口空闲(`http://127.0.0.1:${String(获得Appium端口())}`)
    return 结果
  }

  return { 获得常驻目录, 确保Appium常驻, 确保WDA常驻, 停止全部常驻服务 }
}
