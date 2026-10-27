import inquirer from 'inquirer'
import type { 任务准备上下文, 任务准备结果 } from '../model/task-runner'

function 是否已指定过滤器(参数组: string[]): boolean {
  for (let 参数 of 参数组) {
    if (参数 === '--all' || 参数 === '--filter' || 参数.startsWith('--filter=') === true) return true
    if (参数.startsWith('--') === false) return true
  }
  return false
}

export async function 准备单元测试参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  if (是否已指定过滤器(上下文.参数) === true) return { 参数: 上下文.参数 }
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) return { 参数: [...上下文.参数, '--all'] }
  let 回答 = await inquirer.prompt<{ 过滤器: string }>([
    { type: 'input', name: '过滤器', message: '请输入要运行的接口路径正则:', default: '.*' },
  ])
  let 过滤器 = 回答.过滤器.trim() === '' ? '.*' : 回答.过滤器.trim()
  return { 参数: [...上下文.参数, '--filter', 过滤器] }
}
