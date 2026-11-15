import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { setTimeout as 等待 } from 'node:timers/promises'

import { 测试端口已开放 } from './test-process'

type 端口 = { 端口: number; 主机: string }

function 读取输出(程序: string, 参数: string[]): string {
  try {
    return execFileSync(程序, 参数, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    // lsof 没有匹配时退出码为 1，按空输出处理
    return ''
  }
}

function 监听端口的进程(端口号: number): number[] {
  return 读取输出('lsof', ['-nP', `-iTCP:${String(端口号)}`, '-sTCP:LISTEN', '-t'])
    .split('\n')
    .map((行) => Number(行.trim()))
    .filter((编号) => Number.isInteger(编号) && 编号 > 0)
}

function 读取工作目录(进程ID: number): string | null {
  let 行 = 读取输出('lsof', ['-a', '-p', String(进程ID), '-d', 'cwd', '-Fn'])
    .split('\n')
    .find((内容) => 内容.startsWith('n'))
  if (行 === undefined) return null
  try {
    return realpathSync(行.slice(1))
  } catch {
    return null
  }
}

function 读取进程组(进程ID: number): number | null {
  let 值 = Number(读取输出('ps', ['-o', 'pgid=', '-p', String(进程ID)]).trim())
  return Number.isInteger(值) && 值 > 0 ? 值 : null
}

function 读取父进程(进程ID: number): number | null {
  let 值 = Number(读取输出('ps', ['-o', 'ppid=', '-p', String(进程ID)]).trim())
  return Number.isInteger(值) && 值 > 0 ? 值 : null
}

function 进程存活(进程ID: number): boolean {
  try {
    process.kill(进程ID, 0)
    return true
  } catch {
    return false
  }
}

function 发信号(进程ID: number, 信号: NodeJS.Signals): void {
  // 上次 dev:test 的子进程都是自己进程组的组长（detached），整组一起关；不是组长就只关这个进程，不波及别人
  let 组 = 读取进程组(进程ID)
  try {
    if (组 === 进程ID) process.kill(-进程ID, 信号)
    else process.kill(进程ID, 信号)
  } catch {
    // 已经退出
  }
}

/**
 * dev:test 启动前清理上次在同一项目目录留下的残留：占着测试端口、且工作目录就是本项目根目录的进程，
 * 说明是上次 dev:test 没收干净的后端/前端/MCP。别的目录或别的程序占着的一律不动，让后面的端口检查照旧报错。
 * 返回被关掉的进程号。只支持 macOS/Linux（依赖 lsof）；Windows 直接跳过。
 */
export async function 清理同目录残留进程(项目根目录: string, 端口们: 端口[]): Promise<number[]> {
  if (process.platform === 'win32') return []
  let 根 = realpathSync(项目根目录)
  let 目标 = new Set<number>()
  for (let { 端口: 端口号 } of 端口们)
    for (let 进程ID of 监听端口的进程(端口号))
      if (进程ID !== process.pid && 读取工作目录(进程ID) === 根) 目标.add(进程ID)
  // 监听子任务（dev:test:watch）不占端口：只清父进程已经没了（被 init 收养）且工作目录是本项目的，正在运行的 dev:test 的监听任务不动
  for (let 进程ID of 读取输出('pgrep', ['-f', 'scripts/task/index.ts dev:test:watch'])
    .split('\n')
    .map((行) => Number(行.trim()))
    .filter((编号) => Number.isInteger(编号) && 编号 > 0))
    if (进程ID !== process.pid && 读取父进程(进程ID) === 1 && 读取工作目录(进程ID) === 根) 目标.add(进程ID)
  if (目标.size === 0) return []
  console.warn(`发现上次 dev:test 在本目录留下的进程 ${[...目标].join(', ')}，自动关闭`)
  for (let 进程ID of 目标) 发信号(进程ID, 'SIGTERM')
  let 截止 = Date.now() + 8_000
  while (Date.now() < 截止 && [...目标].some(进程存活)) await 等待(200)
  for (let 进程ID of 目标) if (进程存活(进程ID)) 发信号(进程ID, 'SIGKILL')
  截止 = Date.now() + 5_000
  while (Date.now() < 截止) {
    let 仍占用 = false
    for (let { 端口: 端口号, 主机 } of 端口们) if (await 测试端口已开放(端口号, 主机)) 仍占用 = true
    if (仍占用 === false) break
    await 等待(200)
  }
  return [...目标]
}
