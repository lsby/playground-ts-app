import inquirer from 'inquirer'
import type { 任务准备上下文, 任务准备结果 } from '../model/task-runner'

export async function 准备数据库迁移参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  let 已指定名称 = 上下文.参数.some((参数) => 参数 === '--name' || 参数.startsWith('--name=') === true)
  if (已指定名称 === true) return { 参数: 上下文.参数 }
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new Error('非交互环境创建数据库迁移时必须传入 --name <迁移名称>')
  }
  let 回答 = await inquirer.prompt<{ 迁移名称: string }>([
    { type: 'input', name: '迁移名称', message: '请输入 migration 名称:', default: 'update' },
  ])
  let 迁移名称 = 回答.迁移名称.trim()
  if (迁移名称 === '') throw new Error('migration 名称不能为空')
  return { 参数: [...上下文.参数, '--name', 迁移名称] }
}
