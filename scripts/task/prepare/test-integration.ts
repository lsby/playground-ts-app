import inquirer from 'inquirer'
import fs from 'node:fs'
import path from 'node:path'
import type { 任务准备上下文, 任务准备结果 } from '../model/task-runner'

export async function 准备集成测试参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  let 目标目录 = path.resolve(上下文.工作目录, 'test/integration')
  let 文件列表 = fs
    .readdirSync(目标目录)
    .filter((文件) => 文件.endsWith('.ts') === true)
    .sort((左, 右) => 左.localeCompare(右))
  let 已指定目标 = 上下文.参数.some((参数) => {
    if (参数 === '--all') return true
    let 基础文件名 = path.basename(参数.replaceAll('\\', '/'))
    return 文件列表.some((文件) => 文件 === 基础文件名 || 文件 === `${基础文件名}.ts`)
  })
  if (已指定目标 === true) return { 参数: 上下文.参数 }
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) return { 参数: [...上下文.参数, '--all'] }
  let 回答 = await inquirer.prompt<{ 运行目标: string }>([
    {
      type: 'list',
      name: '运行目标',
      message: '请选择要运行的集成测试文件:',
      choices: [{ name: '[全部运行]', value: '--all' }, ...文件列表.map((文件) => ({ name: 文件, value: 文件 }))],
      default: '--all',
    },
  ])
  return { 参数: [...上下文.参数, 回答.运行目标] }
}
