import { spawn } from 'child_process'
import * as fs from 'fs'
import inquirer from 'inquirer'
import * as path from 'path'

async function 主函数(): Promise<void> {
  // 1. 扫描 test/e2e 目录下的所有 .spec.ts 文件
  let 根目录 = path.resolve(import.meta.dirname, '../../')
  let 测试目录 = path.join(根目录, 'test/e2e')
  let 测试文件列表: string[] = []

  if (fs.existsSync(测试目录) === true) {
    测试文件列表 = 扫描测试文件(测试目录).map((文件) => path.relative(测试目录, 文件))
  }

  // 2. 交互式问题
  let 选项列表 = [
    { name: '[全部运行]', value: 'all' },
    ...测试文件列表.map((文件) => ({ name: 文件, value: path.join('test/e2e', 文件) })),
  ]

  let { 运行目标, 演示模式 } = (await inquirer.prompt([
    { type: 'list', name: '运行目标', message: '请选择要运行的测试文件:', choices: 选项列表, default: 'all' },
    {
      type: 'confirm',
      name: '演示模式',
      message: '是否使用演示 (Demo) 模式? (将开启浏览器 UI 并减慢执行速度)',
      default: true,
    },
  ] as any)) as { 运行目标: string; 演示模式: boolean }

  // 3. 拼接命令
  let 环境变量 = { ...process.env }
  环境变量['DEMO_MODE'] = 演示模式 === true ? 'true' : 'false'

  let 参数列表 = ['test']
  if (运行目标 !== 'all') {
    参数列表.push(运行目标)
  }

  if (演示模式 === true) {
    参数列表.push('--headed')
  }

  // 支持透传额外的参数 (例如 npm run task -- test:e2e -- --ui)
  let 附加参数 = process.argv.slice(2)
  if (附加参数.length > 0) {
    参数列表.push(...附加参数)
  }

  console.log(`\n🚀 正在执行命令: playwright ${参数列表.join(' ')}\n`)

  // 4. 执行命令
  let 进程 = spawn('playwright', 参数列表, { stdio: 'inherit', env: 环境变量, shell: true, cwd: 根目录 })

  进程.on('close', (退出码) => {
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

主函数().catch((错误) => {
  console.error(`\n💥 发生未处理的错误:`, 错误)
  process.exit(1)
})
