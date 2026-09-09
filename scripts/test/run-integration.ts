import { execSync } from 'child_process'
import * as fs from 'fs'
import inquirer from 'inquirer'
import * as path from 'path'
import { fileURLToPath } from 'url'

async function 主函数(): Promise<void> {
  let 当前文件路径 = fileURLToPath(import.meta.url)
  let 当前目录路径 = path.dirname(当前文件路径)
  let 目标目录 = path.resolve(当前目录路径, '../../test/integration')

  let 文件列表 = fs.readdirSync(目标目录)
  let 源代码文件列表 = 文件列表.filter((文件) => {
    return 文件.endsWith('.ts') === true
  })

  let 原始参数 = process.argv.slice(2)
  let 是否全部运行 = 原始参数.includes('--all')
  let 附加参数组 = 原始参数.filter((参数) => 参数 !== '--all')

  let 运行目标: string
  if (是否全部运行 === true) {
    运行目标 = 'all'
  } else {
    // 交互式问题
    let 选项列表 = [
      { name: '[全部运行]', value: 'all' },
      ...源代码文件列表.map((文件) => ({ name: 文件, value: 文件 })),
    ]

    let 回答 = (await inquirer.prompt([
      { type: 'list', name: '运行目标', message: '请选择要运行的集成测试文件:', choices: 选项列表, default: 'all' },
    ] as any)) as { 运行目标: string }
    运行目标 = 回答.运行目标
  }

  let 需要运行的文件列表 = 运行目标 === 'all' ? 源代码文件列表 : [运行目标]

  for (let 文件 of 需要运行的文件列表) {
    let 文件绝对路径 = path.join(目标目录, 文件)
    let 附加参数 = 附加参数组.join(' ')
    let 运行命令 = `tsx "${文件绝对路径}" ${附加参数}`.trim()

    console.log(`\n==========================================`)
    console.log(`🚀 开始执行集成测试: ${文件}`)
    console.log(`==========================================\n`)

    try {
      execSync(运行命令, { stdio: 'inherit', env: process.env })
    } catch (错误) {
      console.error(`\n❌ 测试执行失败 : ${文件} : ${错误}`)
      process.exit(1)
    }
  }

  console.log(`\n✅ 所有选定的集成测试执行成功！`)
}

主函数().catch((错误) => {
  console.error(`\n💥 发生未处理的错误:`, 错误)
  process.exit(1)
})
