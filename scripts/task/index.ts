import inquirer from 'inquirer'
import {
  优雅终止全部任务进程,
  强制终止全部任务进程,
  打印任务列表,
  执行任务,
  type 任务表类型,
  type 任务配置,
} from './task-runner'
import { 任务表 } from './taskfile'

import { 保存上次任务, 模糊过滤并排序任务, 读取上次任务, type 候选任务项 } from './task-search'

type 任务选项 = 候选任务项

function 打印帮助(): void {
  console.log(`用法:
  npm run task
  npm run task -- <任务名称> [--env <环境文件>] [--dry-run] [-- <任务参数>]
  npm run task -- --list
  npm run task -- --list-all`)
}

function 获得详细说明(任务名称: string, 任务: 任务配置): string {
  let 依赖组 = 任务.依赖 ?? []
  let 依赖说明 = 依赖组.length === 0 ? '无' : `${依赖组.join('、')}（${任务.依赖方式 ?? '串行'}）`
  let 说明组 = [任务.详细说明 ?? `执行“${任务.说明}”任务。`, `前置任务：${依赖说明}。`]
  if (任务.环境文件 !== undefined) 说明组.push(`环境文件：${任务.环境文件}。`)
  if (任务.传递参数 === true) 说明组.push('支持在第二个 -- 后传递任务参数。')
  说明组.push(`执行：npm run task -- ${任务名称}`)
  return 说明组.join('\n')
}

async function 选择任务(): Promise<string> {
  if (process.stdin.isTTY !== true)
    throw new Error('非交互环境必须明确指定任务名称，运行 npm run task -- --list 查看可用任务')
  let 可执行任务表: 任务表类型 = 任务表
  let 上次任务 = await 读取上次任务()
  let 候选任务组: 任务选项[] = Object.entries(可执行任务表)
    .filter(([, 任务]) => 任务.公开 !== false)
    .map(([任务名称, 任务]) => {
      let 是上次任务 = 上次任务 !== undefined && 任务名称 === 上次任务
      return {
        name: 是上次任务 ? `${任务名称}:${任务.说明} (上次运行)` : `${任务名称}:${任务.说明}`,
        value: 任务名称,
        description: 获得详细说明(任务名称, 任务),
        说明: 任务.说明,
      }
    })
  try {
    let { 任务名称 } = await inquirer.prompt<{ 任务名称: string }>([
      {
        type: 'search',
        name: '任务名称',
        message: '选择要执行的任务',
        pageSize: 15,
        source: (输入: string | undefined): 任务选项[] => {
          return 模糊过滤并排序任务({ 候选任务列表: 候选任务组, 输入, 上次任务 })
        },
      },
    ])
    return 任务名称
  } catch (错误) {
    if (错误 instanceof Error && 错误.name === 'ExitPromptError') {
      console.log('已取消')
      process.exit(0)
    }
    throw 错误
  }
}

let 原始参数 = process.argv.slice(2)
let 分隔符索引 = 原始参数.indexOf('--')
let 执行器参数 = 分隔符索引 === -1 ? 原始参数 : 原始参数.slice(0, 分隔符索引)
let 任务参数 = 分隔符索引 === -1 ? [] : 原始参数.slice(分隔符索引 + 1)

if (执行器参数.includes('--help') === true || 执行器参数.includes('-h') === true) {
  打印帮助()
} else if (执行器参数.includes('--list') === true || 执行器参数.includes('--list-all') === true) {
  打印任务列表(任务表, 执行器参数.includes('--list-all'))
} else {
  let 任务名称: string | undefined
  let 环境文件: string | undefined
  let 仅显示计划 = false
  for (let 索引 = 0; 索引 < 执行器参数.length; 索引 += 1) {
    let 参数 = 执行器参数[索引]
    if (参数 === undefined) throw new Error(`执行器参数索引越界: ${索引}`)
    if (参数 === '--dry-run') {
      仅显示计划 = true
      continue
    }
    if (参数 === '--env') {
      环境文件 = 执行器参数[索引 + 1]
      if (环境文件 === undefined) throw new Error('--env 后必须提供环境文件路径')
      索引 += 1
      continue
    }
    if (参数.startsWith('-') === true) throw new Error(`未知的任务执行器参数: ${参数}`)
    if (任务名称 !== undefined) throw new Error(`只能指定一个任务，已收到: ${任务名称}、${参数}`)
    任务名称 = 参数
  }
  任务名称 ??= await 选择任务()
  await 保存上次任务(任务名称)

  let 退出状态: { 处理Promise: Promise<void> | null; 信号: 'SIGINT' | 'SIGTERM' | null } = {
    处理Promise: null,
    信号: null,
  }
  let 取消控制器 = new AbortController()
  let 请求退出 = (信号: 'SIGINT' | 'SIGTERM'): void => {
    if (退出状态.处理Promise !== null) {
      console.warn('\n[task] 再次收到退出信号，强制终止全部子进程')
      强制终止全部任务进程()
      return
    }
    退出状态.信号 = 信号
    取消控制器.abort(new Error(`收到退出信号: ${信号}`))
    退出状态.处理Promise = 优雅终止全部任务进程(信号)
  }
  let 处理中断信号 = (): void => 请求退出('SIGINT')
  let 处理终止信号 = (): void => 请求退出('SIGTERM')
  process.on('SIGINT', 处理中断信号)
  process.on('SIGTERM', 处理终止信号)
  try {
    await 执行任务(任务表, 任务名称, {
      ...(环境文件 === undefined ? {} : { 环境文件 }),
      传递参数: 任务参数,
      仅显示计划,
      取消信号: 取消控制器.signal,
    })
    if (退出状态.处理Promise !== null) await 退出状态.处理Promise
  } catch (错误) {
    if (退出状态.处理Promise === null) {
      强制终止全部任务进程()
      throw 错误
    }
    await 退出状态.处理Promise
  } finally {
    process.off('SIGINT', 处理中断信号)
    process.off('SIGTERM', 处理终止信号)
  }
  if (退出状态.信号 !== null) process.exitCode = 退出状态.信号 === 'SIGINT' ? 130 : 143
}
