import inquirer from 'inquirer'
import type { 任务准备上下文, 任务准备结果 } from '../model/task-runner'

export async function 准备发布版本参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  let 已指定版本 = 上下文.参数.some((参数) => 参数 === '--release' || 参数.startsWith('--release=') === true)
  if (已指定版本 === true) return { 参数: [...上下文.参数, '--yes'] }
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new Error('非交互环境执行版本发布时必须传入 --release <版本类型或版本号>')
  }
  let 回答 = await inquirer.prompt<{ 发布版本: string }>([
    {
      type: 'input',
      name: '发布版本',
      message: '请输入发布类型或版本号 (major/minor/patch/prerelease/x.y.z):',
      default: 'patch',
    },
  ])
  let 发布版本 = 回答.发布版本.trim()
  if (发布版本 === '') throw new Error('发布类型或版本号不能为空')
  return { 参数: [...上下文.参数, '--release', 发布版本, '--yes'] }
}
