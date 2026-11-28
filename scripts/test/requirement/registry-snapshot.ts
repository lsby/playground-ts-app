import crossSpawn from 'cross-spawn'
import { fileURLToPath } from 'node:url'

import { 登记快照标记, 登记快照模型, type 登记快照 } from './registry-snapshot-format'

let 子进程超时毫秒 = 120_000

/**
 * 开临时子进程发现全部需求流程并返回名称快照。
 * 流程模块会被 Node 缓存，放进常驻 MCP 进程后任何流程文件的删改都会触发“源码已修改”，所以只在子进程里加载。
 */
export async function 读取登记快照(项目根目录: string, 需求描述文件: string): Promise<登记快照> {
  let 脚本 = fileURLToPath(new URL('./registry-child.ts', import.meta.url))
  let 输出 = await new Promise<string>((完成, 失败) => {
    let 进程 = crossSpawn(process.execPath, ['--import', 'tsx', 脚本, 项目根目录, 需求描述文件], {
      cwd: 项目根目录,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let 标准输出 = ''
    let 标准错误 = ''
    let 超时 = setTimeout((): void => {
      进程.kill('SIGKILL')
    }, 子进程超时毫秒)
    进程.stdout?.on('data', (块: Buffer): void => {
      标准输出 += 块.toString('utf8')
    })
    进程.stderr?.on('data', (块: Buffer): void => {
      标准错误 += 块.toString('utf8')
    })
    进程.once('error', (错误): void => {
      clearTimeout(超时)
      失败(错误)
    })
    进程.once('close', (退出码, 信号): void => {
      clearTimeout(超时)
      if (退出码 === 0) 完成(标准输出)
      else {
        let 详情 = 标准错误.trim() === '' ? 标准输出.trim() : 标准错误.trim()
        失败(new Error(`读取已有需求流程失败（退出码 ${String(退出码)}，信号 ${String(信号)}）：${详情}`))
      }
    })
  })
  let 行 = 输出.split('\n').find((内容) => 内容.startsWith(登记快照标记))
  if (行 === undefined) throw new Error(`读取已有需求流程失败：子进程没有输出登记快照：${输出.trim()}`)
  return 登记快照模型.parse(JSON.parse(行.slice(登记快照标记.length)))
}
