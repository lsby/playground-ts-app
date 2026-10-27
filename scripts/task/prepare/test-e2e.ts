import inquirer from 'inquirer'
import fs from 'node:fs'
import path from 'node:path'
import type { 任务准备上下文, 任务准备结果 } from '../model/task-runner'

function 扫描测试文件(目录: string): string[] {
  let 结果: string[] = []
  for (let 项 of fs.readdirSync(目录, { withFileTypes: true })) {
    let 路径 = path.join(目录, 项.name)
    if (项.isDirectory() === true) 结果.push(...扫描测试文件(路径))
    else if (项.isFile() === true && 项.name.endsWith('.spec.ts') === true) 结果.push(路径)
  }
  return 结果.sort((左, 右) => 左.localeCompare(右))
}

export async function 准备端到端测试参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  let 测试目录 = path.resolve(上下文.工作目录, 'test/e2e')
  let 文件列表 = fs.existsSync(测试目录)
    ? 扫描测试文件(测试目录).map((文件) => path.relative(测试目录, 文件).replaceAll('\\', '/'))
    : []
  let 参数组 = [...上下文.参数]
  let 已指定目标 = 参数组.some(
    (参数) => 参数 === '--all' || 参数.endsWith('.spec.ts') === true || 参数.includes('test/e2e') === true,
  )
  if (已指定目标 === false) {
    if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) 参数组.push('--all')
    else {
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
  let 已指定模式 = 参数组.some((参数) => 参数 === '--demo' || 参数 === '--auto' || 参数 === '--mode')
  if (已指定模式 === false) {
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
