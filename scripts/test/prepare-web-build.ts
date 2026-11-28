import { spawn } from 'node:child_process'
import path from 'node:path'
import { z } from 'zod'
import { 获得环境变量 } from '../../src/global/env/env'
import { 准备测试Web构建, 计算构建环境摘要 } from './web-build-cache'

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 环境文件 = z.string().min(1).parse(process.env['ENV_FILE_PATH'])
let 环境变量 = 获得环境变量()
if (环境变量.NODE_ENV !== 'test' || 环境变量.BUILD_TARGET !== 'web')
  throw new Error('测试前端缓存仅允许用于 Web 测试环境')

async function 运行任务(任务: 'generate:all:fast' | 'build:web:test:bundle'): Promise<void> {
  await new Promise<void>((完成, 失败): void => {
    let 子进程 = spawn(process.execPath, ['--import', 'tsx', 'scripts/task/index.ts', 任务, '--env', 环境文件], {
      cwd: 项目根目录,
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true,
    })
    子进程.once('error', 失败)
    子进程.once('close', (退出码, 信号): void => {
      if (退出码 === 0) 完成()
      else 失败(new Error(`测试构建任务 ${任务} 失败，退出码 ${String(退出码)}，信号 ${String(信号)}`))
    })
  })
}

let 结果 = await 准备测试Web构建({
  根目录: 项目根目录,
  环境文件,
  环境摘要: 计算构建环境摘要(项目根目录, 环境变量, process.env),
  生成: async (): Promise<void> => await 运行任务('generate:all:fast'),
  构建: async (): Promise<void> => await 运行任务('build:web:test:bundle'),
})
console.log(
  `[web-test-cache] ${结果.命中 ? '输入和完整产物一致，复用构建' : '已重新构建'}（${String(结果.耗时毫秒)}ms）`,
)
