import { spawn } from 'child_process'
import * as fs from 'fs'
import inquirer from 'inquirer'
import * as path from 'path'
import { pathToFileURL } from 'url'

async function 主函数(): Promise<void> {
  // 1. 扫描 test/e2e 目录下的所有 .spec.ts 文件
  let 根目录 = path.resolve(import.meta.dirname, '../../')
  let 测试目录 = path.join(根目录, 'test/e2e')
  let 测试文件列表: string[] = []

  if (fs.existsSync(测试目录) === true) {
    测试文件列表 = 扫描测试文件(测试目录).map((文件) => path.relative(测试目录, 文件).replaceAll('\\', '/'))
  }

  // 2. 解析参数
  let 原始参数组 = process.argv.slice(2)
  let 指定模式: 'auto' | 'demo' | undefined
  let 指定运行目标: string | undefined
  let 附加透传参数: string[] = []

  for (let 索引 = 0; 索引 < 原始参数组.length; 索引 += 1) {
    let 参数 = 原始参数组[索引]
    if (参数 === '--demo') {
      指定模式 = 'demo'
      continue
    }
    if (参数 === '--auto') {
      指定模式 = 'auto'
      continue
    }
    if (参数 === '--mode') {
      let 模式值 = 原始参数组[索引 + 1]
      if (模式值 === 'auto' || 模式值 === 'demo') {
        指定模式 = 模式值
        索引 += 1
      }
      continue
    }
    if (参数 !== undefined) {
      let 规范化参数 = 参数.replaceAll('\\', '/')
      if (规范化参数 === '--all') {
        指定运行目标 = 'all'
        continue
      }
      if (规范化参数.endsWith('.spec.ts') === true || 规范化参数.includes('test/e2e') === true) {
        指定运行目标 = 规范化参数
        continue
      }
      let 基础文件名 = path.basename(规范化参数)
      let 匹配文件 = 测试文件列表.find((文件) => 文件 === 基础文件名 || 文件 === `${基础文件名}.spec.ts`)
      if (匹配文件 !== undefined && 指定运行目标 === undefined) {
        指定运行目标 = `test/e2e/${匹配文件}`
        continue
      }
      附加透传参数.push(参数)
    }
  }

  // 3. 确定运行目标与演示模式
  let 运行目标: string
  if (指定运行目标 !== undefined) {
    运行目标 = 指定运行目标
  } else if (process.stdin.isTTY === true) {
    let 选项列表 = [
      { name: '[全部运行]', value: 'all' },
      ...测试文件列表.map((文件) => ({ name: 文件, value: `test/e2e/${文件}` })),
    ]
    let 回答 = await inquirer.prompt<{ 运行目标: string }>([
      { type: 'list', name: '运行目标', message: '请选择要运行的端到端测试文件:', choices: 选项列表, default: 'all' },
    ])
    运行目标 = 回答.运行目标
  } else {
    运行目标 = 'all'
  }

  let 演示模式: boolean
  if (指定模式 !== undefined) {
    演示模式 = 指定模式 === 'demo'
  } else if (process.stdin.isTTY === true) {
    let 回答 = await inquirer.prompt<{ 演示模式: boolean }>([
      {
        type: 'confirm',
        name: '演示模式',
        message: '是否使用演示 (Demo) 模式? (将开启浏览器 UI 并减慢执行速度)',
        default: false,
      },
    ])
    演示模式 = 回答.演示模式
  } else {
    演示模式 = false
  }

  // 4. 拼接命令
  let 环境变量 = { ...process.env }
  环境变量['DEMO_MODE'] = 演示模式 === true ? 'true' : 'false'

  let 参数列表 = ['test']
  if (运行目标 !== 'all') {
    参数列表.push(运行目标.replaceAll('\\', '/'))
  }

  if (演示模式 === true) {
    参数列表.push('--headed')
  }

  // 支持透传额外的参数 (例如 npm run task -- test:e2e -- --ui)
  if (附加透传参数.length > 0) {
    参数列表.push(...附加透传参数)
  }

  console.log(`\n🚀 正在执行命令: playwright ${参数列表.join(' ')}\n`)

  // 4. 执行命令
  let 进程 = spawn('playwright', 参数列表, { stdio: 'inherit', env: 环境变量, shell: true, cwd: 根目录 })

  进程.on('error', (错误) => {
    console.error('\n💥 启动 playwright 失败:', 错误)
    process.exit(1)
  })

  进程.on('close', (退出码) => {
    let 报告文件 = path.join(根目录, 'test-outputs/playwright-report/index.html')
    if (fs.existsSync(报告文件) === true) {
      let 报告链接 = pathToFileURL(报告文件).href
      console.log(`\n==========================================`)
      console.log(`📊 端到端测试报告已生成: ${报告链接}`)
      console.log(`==========================================\n`)
    }
    process.exit(退出码 ?? 1)
  })
}

function 扫描测试文件(目录: string): string[] {
  let 结果: string[] = []
  for (let 项 of fs.readdirSync(目录, { withFileTypes: true })) {
    let 路径 = path.join(目录, 项.name)
    if (项.isDirectory() === true) 结果.push(...扫描测试文件(路径))
    else if (项.isFile() === true && 项.name.endsWith('.spec.ts') === true) 结果.push(路径)
  }
  return 结果.sort((左, 右) => 左.localeCompare(右))
}

主函数().catch((错误: unknown) => {
  if (错误 instanceof Error && (错误.name === 'ExitPromptError' || 错误.message.includes('force closed the prompt'))) {
    process.exit(0)
  }
  console.error(`\n💥 发生未处理的错误:`, 错误)
  process.exit(1)
})
