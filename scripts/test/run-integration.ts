import crossSpawn from 'cross-spawn'
import * as fs from 'fs'
import inquirer from 'inquirer'
import * as path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { 生成集成测试报告, type 单个集成测试结果 } from './integration-report-generator'

async function 运行单个集成测试(
  文件绝对路径: string,
  相对路径: string,
  文件名: string,
  附加参数组: string[],
): Promise<单个集成测试结果> {
  let 开始时间戳 = Date.now()
  let 开始时间文本 = new Date().toLocaleTimeString()
  let 标准输出 = ''
  let 错误输出 = ''

  console.log(`\n==========================================`)
  console.log(`🚀 开始执行集成测试: ${文件名}`)
  console.log(`==========================================\n`)

  let 退出码 = await new Promise<number>((resolve) => {
    let 参数列表 = [文件绝对路径, ...附加参数组]
    let 子进程 = crossSpawn('tsx', 参数列表, { env: process.env, stdio: ['inherit', 'pipe', 'pipe'] })

    if (子进程.stdout !== null) {
      子进程.stdout.on('data', (数据: Buffer) => {
        let 文本 = 数据.toString()
        标准输出 += 文本
        process.stdout.write(文本)
      })
    }

    if (子进程.stderr !== null) {
      子进程.stderr.on('data', (数据: Buffer) => {
        let 文本 = 数据.toString()
        错误输出 += 文本
        process.stderr.write(文本)
      })
    }

    子进程.on('error', (错误) => {
      错误输出 += String(错误)
      console.error(`\n❌ 子进程异常: ${String(错误)}`)
      resolve(1)
    })

    子进程.on('close', (码) => {
      resolve(码 ?? 1)
    })
  })

  let 结束时间戳 = Date.now()
  let 结束时间文本 = new Date().toLocaleTimeString()
  let 耗时 = 结束时间戳 - 开始时间戳
  let 是通过 = 退出码 === 0

  if (是通过 === true) {
    console.log(`\n✅ ${文件名} 执行通过 (${String(耗时)} ms)`)
  } else {
    console.error(`\n❌ ${文件名} 执行失败，退出码: ${String(退出码)} (${String(耗时)} ms)`)
  }

  return {
    测试文件名: 文件名,
    相对路径,
    状态: 是通过 === true ? 'passed' : 'failed',
    耗时毫秒: 耗时,
    退出码,
    标准输出,
    错误输出,
    开始时间: 开始时间文本,
    结束时间: 结束时间文本,
  }
}

async function 主函数(): Promise<void> {
  let 当前文件路径 = fileURLToPath(import.meta.url)
  let 当前目录路径 = path.dirname(当前文件路径)
  let 根目录 = path.resolve(当前目录路径, '../../')
  let 目标目录 = path.resolve(根目录, 'test/integration')
  let 报告目录 = path.resolve(根目录, 'test-outputs/integration-report')

  let 文件列表 = fs.readdirSync(目标目录)
  let 源代码文件列表 = 文件列表.filter((文件) => {
    return 文件.endsWith('.ts') === true
  })

  let 原始参数 = process.argv.slice(2)
  let 是否全部运行 = false
  let 自动打开报告 = false
  let 指定目标文件: string | undefined
  let 附加参数组: string[] = []

  for (let 参数 of 原始参数) {
    if (参数 === '--all') {
      是否全部运行 = true
      continue
    }
    if (参数 === '--open') {
      自动打开报告 = true
      continue
    }
    let 规范化 = 参数.replaceAll('\\', '/')
    let 基础文件名 = path.basename(规范化)
    let 匹配的文件 = 源代码文件列表.find((文件) => 文件 === 基础文件名 || 文件 === `${基础文件名}.ts`)
    if (匹配的文件 !== undefined && 指定目标文件 === undefined) {
      指定目标文件 = 匹配的文件
      continue
    }
    附加参数组.push(参数)
  }

  let 运行目标: string
  if (是否全部运行 === true) {
    运行目标 = 'all'
  } else if (指定目标文件 !== undefined) {
    运行目标 = 指定目标文件
  } else if (process.stdin.isTTY === true) {
    let 选项列表 = [
      { name: '[全部运行]', value: 'all' },
      ...源代码文件列表.map((文件) => ({ name: 文件, value: 文件 })),
    ]

    let 回答 = await inquirer.prompt<{ 运行目标: string }>([
      { type: 'list', name: '运行目标', message: '请选择要运行的集成测试文件:', choices: 选项列表, default: 'all' },
    ])
    运行目标 = 回答.运行目标
  } else {
    运行目标 = 'all'
  }

  let 需要运行的文件列表 = 运行目标 === 'all' ? 源代码文件列表 : [运行目标]
  let 总开始时间 = Date.now()
  let 测试结果列表: 单个集成测试结果[] = []

  for (let 文件 of 需要运行的文件列表) {
    let 文件绝对路径 = path.join(目标目录, 文件)
    let 相对路径 = path.relative(根目录, 文件绝对路径).replaceAll('\\', '/')
    let 结果 = await 运行单个集成测试(文件绝对路径, 相对路径, 文件, 附加参数组)
    测试结果列表.push(结果)
  }

  let 总结束时间 = Date.now()
  let { html路径, 全部通过 } = 生成集成测试报告(测试结果列表, 报告目录, 总开始时间, 总结束时间)

  let 报告链接 = pathToFileURL(html路径).href
  console.log(`\n==========================================`)
  console.log(`📊 集成测试报告已生成: ${报告链接}`)
  console.log(`==========================================\n`)

  if (自动打开报告 === true) {
    let { sync } = await import('cross-spawn')
    sync('open-cli', [html路径], { stdio: 'inherit' })
  }

  if (全部通过 === false) {
    console.error(`\n❌ 部分集成测试未通过，详情见测试报告。`)
    process.exit(1)
  }

  console.log(`\n✅ 所有选定的集成测试执行成功！`)
}

主函数().catch((错误) => {
  console.error(`\n💥 发生未处理的错误:`, 错误)
  process.exit(1)
})
