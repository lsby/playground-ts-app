import { ChildProcess, spawnSync } from 'child_process'
import crossSpawn from 'cross-spawn'
import { createHash } from 'crypto'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

export type 命令配置 = { 程序: string; 参数: string[] }
export type 任务配置 = {
  说明: string
  详细说明?: string
  依赖?: string[]
  依赖方式?: '串行' | '并行'
  环境文件?: string
  环境变量?: Record<string, string>
  工作目录?: string
  运行?: 命令配置 | 命令配置[]
  传递参数?: boolean
  需要环境文件?: boolean
  公开?: boolean
}
export type 任务表类型 = Record<string, 任务配置>
export type 执行选项 = { 环境文件?: string; 传递参数?: string[]; 仅显示计划?: boolean; 取消信号?: AbortSignal }
type 执行上下文 = { 环境变量: NodeJS.ProcessEnv; 标识: string }
type 执行记录 = { 上下文标识: string; 执行Promise: Promise<void> }

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 活动进程组 = new Set<ChildProcess>()
let 活动进程清空回调组 = new Set<() => void>()

export function 命令(程序: string, ...参数: string[]): 命令配置 {
  return { 程序, 参数 }
}

export function 定义任务<任务表 extends 任务表类型>(任务表: 任务表): 任务表 {
  return 任务表
}

function 获得环境标识(环境变量: NodeJS.ProcessEnv): string {
  let 内容 = JSON.stringify(Object.entries(环境变量).sort(([左名称], [右名称]) => 左名称.localeCompare(右名称)))
  return createHash('sha256').update(内容).digest('hex')
}

function 加载环境文件(上下文: 执行上下文, 环境文件: string): 执行上下文 {
  let 绝对路径 = path.resolve(项目根目录, 环境文件)
  if (fs.existsSync(绝对路径) === false) throw new Error(`找不到环境文件: ${环境文件}`)
  let 文件变量 = dotenv.parse(fs.readFileSync(绝对路径))
  let 已解析变量 = new Map<string, string>()
  let 解析变量 = (名称: string, 路径: string[]): string => {
    let 已解析值 = 已解析变量.get(名称)
    if (已解析值 !== undefined) return 已解析值
    if (路径.includes(名称) === true)
      throw new Error(`环境文件 ${环境文件} 存在循环引用: ${[...路径, 名称].join(' -> ')}`)
    let 原始值 = 文件变量[名称]
    if (原始值 === undefined) {
      let 继承值 = 上下文.环境变量[名称]
      if (继承值 === undefined) throw new Error(`环境文件 ${环境文件} 引用了未定义的变量: ${名称}`)
      return 继承值
    }
    let 新路径 = [...路径, 名称]
    let 解析值 = 原始值.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_匹配内容, 引用名称: string) =>
      解析变量(引用名称, 新路径),
    )
    已解析变量.set(名称, 解析值)
    return 解析值
  }
  let 环境变量: NodeJS.ProcessEnv = { ...上下文.环境变量 }
  for (let 名称 of Object.keys(文件变量)) 环境变量[名称] = 解析变量(名称, [])
  环境变量['ENV_FILE_PATH'] = 环境文件
  return { 环境变量, 标识: 获得环境标识(环境变量) }
}

function 应用任务环境(上下文: 执行上下文, 任务: 任务配置, 是否应用任务环境文件: boolean): 执行上下文 {
  let 新上下文 =
    是否应用任务环境文件 === false || 任务.环境文件 === undefined ? 上下文 : 加载环境文件(上下文, 任务.环境文件)
  if (任务.环境变量 === undefined) return 新上下文
  let 环境变量 = { ...新上下文.环境变量, ...任务.环境变量 }
  return { 环境变量, 标识: 获得环境标识(环境变量) }
}

function 规范化命令组(任务: 任务配置): 命令配置[] {
  if (任务.运行 === undefined) return []
  return Array.isArray(任务.运行) === true ? 任务.运行 : [任务.运行]
}

function 删除活动进程(进程: ChildProcess): void {
  活动进程组.delete(进程)
  if (活动进程组.size !== 0) return
  for (let 回调 of 活动进程清空回调组) 回调()
  活动进程清空回调组.clear()
}

function 请求进程优雅终止(进程: ChildProcess): void {
  if (进程.pid === undefined || 进程.exitCode !== null) return
  try {
    process.kill(-进程.pid, 'SIGTERM')
  } catch (_错误) {
    进程.kill('SIGTERM')
  }
}

function 强制终止进程(进程: ChildProcess): void {
  if (进程.pid === undefined || 进程.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(进程.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-进程.pid, 'SIGKILL')
  } catch (_错误) {
    进程.kill('SIGKILL')
  }
}

function 等待全部任务进程退出(超时毫秒: number): Promise<boolean> {
  if (活动进程组.size === 0) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    let 定时器: NodeJS.Timeout | undefined
    let 完成 = (是否全部退出: boolean): void => {
      if (定时器 !== undefined) clearTimeout(定时器)
      活动进程清空回调组.delete(进程清空)
      resolve(是否全部退出)
    }
    let 进程清空 = (): void => 完成(true)
    活动进程清空回调组.add(进程清空)
    定时器 = setTimeout(() => 完成(活动进程组.size === 0), 超时毫秒)
  })
}

export function 强制终止全部任务进程(): void {
  for (let 进程 of 活动进程组) 强制终止进程(进程)
}

export async function 优雅终止全部任务进程(信号: 'SIGINT' | 'SIGTERM', 超时毫秒 = 10_000): Promise<void> {
  console.log(`\n[task] 收到 ${信号}，等待子进程优雅退出，最长 ${超时毫秒}ms`)
  if (process.platform !== 'win32') for (let 进程 of 活动进程组) 请求进程优雅终止(进程)
  if ((await 等待全部任务进程退出(超时毫秒)) === true) return
  console.warn('[task] 优雅退出超时，强制终止剩余子进程')
  强制终止全部任务进程()
  await 等待全部任务进程退出(1_000)
}

async function 执行命令配置(
  任务名称: string,
  配置: 命令配置,
  环境变量: NodeJS.ProcessEnv,
  工作目录: string,
  附加参数: string[],
  取消信号?: AbortSignal,
): Promise<void> {
  取消信号?.throwIfAborted()
  let 参数 = [...配置.参数, ...附加参数]
  console.log(`\n[task] ${任务名称}: ${配置.程序} ${参数.join(' ')}`)
  await new Promise<void>((resolve, reject) => {
    let 进程 = crossSpawn(配置.程序, 参数, {
      cwd: 工作目录,
      env: 环境变量,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    })
    活动进程组.add(进程)
    进程.once('error', (错误) => {
      删除活动进程(进程)
      reject(错误)
    })
    进程.once('close', (退出码, 信号) => {
      删除活动进程(进程)
      if (退出码 === 0) resolve()
      else reject(new Error(`任务 ${任务名称} 执行失败，退出码: ${String(退出码)}，信号: ${String(信号)}`))
    })
  })
}

function 检查任务表(任务表: 任务表类型): void {
  for (let [任务名称, 任务] of Object.entries(任务表)) {
    for (let 依赖名称 of 任务.依赖 ?? []) {
      if (任务表[依赖名称] === undefined) throw new Error(`任务 ${任务名称} 依赖了不存在的任务: ${依赖名称}`)
    }
  }
}

function 格式化命令(配置: 命令配置, 附加参数: string[]): string {
  let 格式化参数 = (参数: string): string => (/\s/.test(参数) === true ? JSON.stringify(参数) : 参数)
  return [配置.程序, ...配置.参数, ...附加参数].map(格式化参数).join(' ')
}

function 打印执行计划(任务表: 任务表类型, 根任务名称: string, 选项: 执行选项): void {
  console.log(`执行计划: ${根任务名称}`)
  if (选项.环境文件 !== undefined) console.log(`显式环境文件: ${选项.环境文件}`)
  let 访问 = (任务名称: string, 前缀: string, 是否最后一项: boolean, 路径: string[]): void => {
    if (路径.includes(任务名称) === true) throw new Error(`检测到循环依赖: ${[...路径, 任务名称].join(' -> ')}`)
    let 任务 = 任务表[任务名称]
    if (任务 === undefined) throw new Error(`不存在任务: ${任务名称}`)
    let 连接符 = 路径.length === 0 ? '' : 是否最后一项 === true ? '└─ ' : '├─ '
    let 标记组: string[] = []
    if ((任务.依赖 ?? []).length > 0) 标记组.push(任务.依赖方式 ?? '串行')
    if (选项.环境文件 === undefined && 任务.环境文件 !== undefined) 标记组.push(`env: ${任务.环境文件}`)
    let 标记 = 标记组.length === 0 ? '' : ` [${标记组.join(', ')}]`
    console.log(`${前缀}${连接符}${任务名称}${标记} - ${任务.说明}`)
    let 子前缀 = 路径.length === 0 ? '' : `${前缀}${是否最后一项 === true ? '   ' : '│  '}`
    let 依赖组 = 任务.依赖 ?? []
    for (let 索引 = 0; 索引 < 依赖组.length; 索引 += 1) {
      let 依赖名称 = 依赖组[索引]
      if (依赖名称 === undefined) throw new Error(`任务 ${任务名称} 的依赖索引越界: ${索引}`)
      访问(依赖名称, 子前缀, 索引 === 依赖组.length - 1, [...路径, 任务名称])
    }
    let 命令组 = 规范化命令组(任务)
    for (let 索引 = 0; 索引 < 命令组.length; 索引 += 1) {
      let 当前命令 = 命令组[索引]
      if (当前命令 === undefined) throw new Error(`任务 ${任务名称} 的命令索引越界: ${索引}`)
      let 附加参数 =
        任务名称 === 根任务名称 && 任务.传递参数 === true && 索引 === 命令组.length - 1 ? (选项.传递参数 ?? []) : []
      console.log(`${子前缀}   $ ${格式化命令(当前命令, 附加参数)}`)
    }
  }
  访问(根任务名称, '', true, [])
}

export async function 执行任务(任务表: 任务表类型, 根任务名称: string, 选项: 执行选项 = {}): Promise<void> {
  检查任务表(任务表)
  if (选项.仅显示计划 === true) {
    打印执行计划(任务表, 根任务名称, 选项)
    return
  }

  let 根任务 = 任务表[根任务名称]
  if (根任务 === undefined) throw new Error(`不存在任务: ${根任务名称}`)
  if (根任务.需要环境文件 === true && 选项.环境文件 === undefined && 根任务.环境文件 === undefined)
    throw new Error(`任务 ${根任务名称} 需要环境文件，请通过 --env <环境文件> 指定`)

  let 根环境变量 = { ...process.env }
  let 根上下文: 执行上下文 = { 环境变量: 根环境变量, 标识: 获得环境标识(根环境变量) }
  if (选项.环境文件 !== undefined) 根上下文 = 加载环境文件(根上下文, 选项.环境文件)
  let 执行记录表 = new Map<string, 执行记录>()

  let 访问 = async (任务名称: string, 上下文: 执行上下文, 路径: string[]): Promise<void> => {
    选项.取消信号?.throwIfAborted()
    if (路径.includes(任务名称) === true) throw new Error(`检测到循环依赖: ${[...路径, 任务名称].join(' -> ')}`)
    let 任务 = 任务表[任务名称]
    if (任务 === undefined) throw new Error(`不存在任务: ${任务名称}`)
    let 当前上下文 = 应用任务环境(上下文, 任务, 选项.环境文件 === undefined)
    let 已有记录 = 执行记录表.get(任务名称)
    if (已有记录 !== undefined) {
      if (已有记录.上下文标识 !== 当前上下文.标识) throw new Error(`任务 ${任务名称} 被要求在两个不同环境中执行`)
      await 已有记录.执行Promise
      return
    }

    let 当前Promise = (async (): Promise<void> => {
      let 开始时间 = Date.now()
      console.log(`[task] 开始 ${任务名称} - ${任务.说明}`)
      let 新路径 = [...路径, 任务名称]
      if (任务.依赖方式 === '并行') {
        await Promise.all((任务.依赖 ?? []).map(async (依赖名称) => 访问(依赖名称, 当前上下文, 新路径)))
      } else {
        for (let 依赖名称 of 任务.依赖 ?? []) await 访问(依赖名称, 当前上下文, 新路径)
      }
      选项.取消信号?.throwIfAborted()
      let 命令组 = 规范化命令组(任务)
      for (let 索引 = 0; 索引 < 命令组.length; 索引 += 1) {
        选项.取消信号?.throwIfAborted()
        let 当前命令 = 命令组[索引]
        if (当前命令 === undefined) throw new Error(`任务 ${任务名称} 的命令索引越界: ${索引}`)
        let 是否最后命令 = 索引 === 命令组.length - 1
        let 附加参数 =
          任务名称 === 根任务名称 && 任务.传递参数 === true && 是否最后命令 === true ? (选项.传递参数 ?? []) : []
        await 执行命令配置(
          任务名称,
          当前命令,
          当前上下文.环境变量,
          path.resolve(项目根目录, 任务.工作目录 ?? '.'),
          附加参数,
          选项.取消信号,
        )
      }
      console.log(`[task] 完成 ${任务名称} (${Date.now() - 开始时间}ms)`)
    })()
    执行记录表.set(任务名称, { 上下文标识: 当前上下文.标识, 执行Promise: 当前Promise })
    await 当前Promise
  }

  await 访问(根任务名称, 根上下文, [])
}

export function 打印任务列表(任务表: 任务表类型, 包含私有任务: boolean): void {
  let 任务组 = Object.entries(任务表).filter(([, 任务]) => 包含私有任务 === true || 任务.公开 !== false)
  for (let [任务名称, 任务] of 任务组) console.log(`${任务名称}:${任务.说明}`)
}
