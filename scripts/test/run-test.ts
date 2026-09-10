import crossSpawn from 'cross-spawn'
import inquirer from 'inquirer'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { 获得单元测试生成参数 } from './unit-test-config'

type 测试选项 = { 过滤器?: string; 生成覆盖率?: boolean; 全部?: boolean; 自动打开?: boolean }

function 解析参数(): 测试选项 {
  let 结果: 测试选项 = {}
  let 参数组 = process.argv.slice(2)
  for (let 索引 = 0; 索引 < 参数组.length; 索引 += 1) {
    let 原始参数 = 参数组[索引]
    if (原始参数 === undefined) continue

    if (原始参数 === '--all') {
      结果.全部 = true
      结果.过滤器 ??= '.*'
      结果.生成覆盖率 ??= true
      continue
    }

    if (原始参数 === '--filter') {
      let 过滤器 = 参数组[索引 + 1]
      if (过滤器 === undefined || 过滤器.startsWith('--') === true) throw new Error('--filter 后必须提供正则表达式')
      结果.过滤器 = 过滤器
      索引 += 1
      continue
    }

    if (原始参数.startsWith('--filter=') === true) {
      结果.过滤器 = 原始参数.slice('--filter='.length)
      continue
    }

    if (原始参数 === '--coverage') {
      结果.生成覆盖率 = true
      continue
    }

    if (原始参数 === '--no-coverage') {
      结果.生成覆盖率 = false
      continue
    }

    if (原始参数 === '--open') {
      结果.自动打开 = true
      continue
    }

    // 未指定过滤器且非 -- 开头时，作为接口路径过滤正则
    if (原始参数.startsWith('--') === false && 结果.过滤器 === undefined) {
      结果.过滤器 = 原始参数
      continue
    }

    throw new Error(`未知参数: ${原始参数}，支持的参数: --all, --filter <正则>, --coverage, --no-coverage, --open`)
  }
  return 结果
}

function 执行命令(程序: string, 参数组: string[]): void {
  let 结果 = crossSpawn.sync(程序, 参数组, { env: process.env, stdio: 'inherit' })
  if (结果.error instanceof Error) throw 结果.error
  if (结果.status !== 0) throw new Error(`命令 ${程序} 执行失败，退出码: ${String(结果.status)}`)
}

async function 主函数(): Promise<void> {
  let 选项 = 解析参数()
  if (选项.过滤器 === undefined) {
    if (process.stdin.isTTY === true) {
      let 回答 = await inquirer.prompt<{ 过滤器: string }>([
        { type: 'input', name: '过滤器', message: '请输入要运行的接口路径正则:', default: '.*' },
      ])
      选项.过滤器 = 回答.过滤器
    } else 选项.过滤器 = '.*'
  }

  // 默认行为即生成覆盖率报告
  选项.生成覆盖率 ??= true

  let 实际过滤器 = 选项.过滤器.trim() === '' ? '.*' : 选项.过滤器.trim()

  console.log(`\n==========================================`)
  console.log(`🚀 开始执行单元测试 (过滤器: ${实际过滤器}, 生成覆盖率: ${String(选项.生成覆盖率)})`)
  console.log(`==========================================\n`)

  try {
    执行命令('lsby-net-core-gen-test', 获得单元测试生成参数(实际过滤器))
    执行命令('vitest', 选项.生成覆盖率 === true ? ['run', '--coverage'] : ['run'])

    if (选项.生成覆盖率 === true) {
      let 报告目录 = path.resolve(import.meta.dirname, '../../test-outputs/coverage')
      let 报告文件 = path.join(报告目录, 'index.html')
      let 报告链接 = pathToFileURL(报告文件).href
      console.log(`\n==========================================`)
      console.log(`📊 单元测试覆盖率报告已生成: ${报告链接}`)
      console.log(`==========================================\n`)

      if (选项.自动打开 === true) {
        执行命令('open-cli', [报告文件])
      }
    }
  } catch (错误) {
    console.error(`\n❌ 测试执行失败 : ${String(错误)}`)
    process.exit(1)
  }

  console.log(`\n✅ 单元测试执行成功！`)
}

主函数().catch((错误) => {
  console.error(`\n💥 发生未处理的错误:`, 错误)
  process.exit(1)
})
