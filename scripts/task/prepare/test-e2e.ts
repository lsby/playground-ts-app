import inquirer from 'inquirer'

import { 端到端测试运行器 } from '../../test/e2e/run-e2e'
import type { 任务准备上下文, 任务准备结果 } from '../model/task-runner'

export async function 准备端到端测试参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  let 运行器 = new 端到端测试运行器(上下文.工作目录)
  let 参数组 = [...上下文.参数]
  let 选项 = 运行器.解析参数(参数组)
  if (选项.仅列出) return { 参数: 参数组 }
  if (选项.目标们.length === 0) {
    if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) 参数组.push('--all')
    else {
      let 文件列表 = await 运行器.扫描测试文件()
      let 回答 = await inquirer.prompt<{ 运行目标: string }>([
        {
          type: 'list',
          name: '运行目标',
          message: '请选择要运行的端到端测试文件:',
          choices: [
            { name: '[全部运行]', value: '--all' },
            ...文件列表.map((文件) => ({ name: 文件, value: `test/e2e/${文件}` })),
          ],
          default: '--all',
        },
      ])
      参数组.push(回答.运行目标)
    }
  }
  if (选项.模式 === undefined) {
    if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) 参数组.push('--auto')
    else {
      let 回答 = await inquirer.prompt<{ 演示模式: boolean }>([
        {
          type: 'confirm',
          name: '演示模式',
          message: '是否使用演示 (Demo) 模式? (将开启浏览器 UI 并减慢执行速度)',
          default: false,
        },
      ])
      参数组.push(回答.演示模式 === true ? '--demo' : '--auto')
    }
  }
  return { 参数: 参数组 }
}
