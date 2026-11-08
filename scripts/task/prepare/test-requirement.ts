import inquirer from 'inquirer'

import { 需求测试运行器 } from '../../test/requirement/run-requirement'
import type { 任务准备上下文, 任务准备结果 } from '../model/task-runner'

export async function 准备需求测试参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  let 参数们 = [...上下文.参数]
  if (参数们.includes('--list')) return { 参数: 参数们 }
  let 已指定 = 参数们.some(
    (参数) =>
      参数 === '--all' ||
      参数 === '--scenario' ||
      参数.startsWith('--scenario=') ||
      参数 === '--requirement' ||
      参数.startsWith('--requirement='),
  )
  if (已指定) return { 参数: 参数们 }
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) return { 参数: [...参数们, '--all'] }
  let 流程们 = await new 需求测试运行器(上下文.工作目录).发现测试()
  let 回答 = await inquirer.prompt<{ 流程名称: string }>([
    {
      type: 'list',
      name: '流程名称',
      message: '请选择需求测试流程',
      choices: [
        { name: '[全部自动流程]', value: '__ALL__' },
        ...流程们
          .filter((流程项) => 流程项.流程.包含人工验收() === false)
          .map((流程项) => ({ name: 流程项.流程.获得名称(), value: 流程项.流程.获得名称() })),
      ],
    },
  ])
  return { 参数: 回答.流程名称 === '__ALL__' ? [...参数们, '--all'] : [...参数们, '--scenario', 回答.流程名称] }
}
