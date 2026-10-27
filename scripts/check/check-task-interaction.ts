import fs from 'node:fs'
import path from 'node:path'

type 违规规则 = { 编号: string; 说明: string; 匹配: RegExp }

type 违规项 = { 文件: string; 行号: number; 编号: string; 说明: string; 内容: string }

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 脚本目录 = path.join(项目根目录, 'scripts')
let 当前文件 = path.resolve(import.meta.filename)
let 源码扩展名组 = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'])
let 允许规则表 = new Map<string, ReadonlySet<string>>([
  ['scripts/external-lfs/operations.ts', new Set(['TASK_INTERACTION_002'])],
  ['scripts/git-hooks/check-staged-files.ts', new Set(['TASK_INTERACTION_002'])],
  ['scripts/public/release-docker-local.ts', new Set(['TASK_INTERACTION_001'])],
  ['scripts/public/release-docker-remote.ts', new Set(['TASK_INTERACTION_001'])],
  ['scripts/setup/github-config-key.ts', new Set(['TASK_INTERACTION_001'])],
  ['scripts/setup/init-ports.ts', new Set(['TASK_INTERACTION_001'])],
  ['scripts/setup/preinstall.mjs', new Set(['TASK_INTERACTION_002'])],
  ['scripts/setup/rename-project.ts', new Set(['TASK_INTERACTION_001'])],
  ['scripts/task/index.ts', new Set(['TASK_INTERACTION_001'])],
  ['scripts/test/requirement-selection.ts', new Set(['TASK_INTERACTION_003'])],
])
let 允许命中组 = new Set<string>()

let 规则组: 违规规则[] = [
  {
    编号: 'TASK_INTERACTION_001',
    说明: '工程脚本不得直接导入 inquirer，交互必须迁移到任务准备阶段',
    匹配: /\bfrom\s+['"]inquirer['"]|\brequire\(\s*['"]inquirer['"]\s*\)/u,
  },
  {
    编号: 'TASK_INTERACTION_002',
    说明: '工程脚本不得直接调用 readline.question，交互必须迁移到任务准备阶段',
    匹配: /\.question\s*\(/u,
  },
  {
    编号: 'TASK_INTERACTION_003',
    说明: '原始终端输入必须声明为准备阶段或运行时人工关卡',
    匹配: /\bemitKeypressEvents\s*\(|process\.stdin\.(?:setRawMode|on)\s*\(/u,
  },
  {
    编号: 'TASK_INTERACTION_004',
    说明: '任务执行器不得默认把 stdin 交给正式任务子进程',
    匹配: /stdio\s*:\s*(?:['"]inherit['"]|\[\s*['"]inherit['"]\s*,)/u,
  },
]

function 扫描文件(目录: string): string[] {
  let 文件组: string[] = []
  for (let 目录项 of fs.readdirSync(目录, { withFileTypes: true })) {
    let 绝对路径 = path.join(目录, 目录项.name)
    if (目录项.isDirectory() === true) {
      文件组.push(...扫描文件(绝对路径))
      continue
    }
    if (目录项.isFile() === true && 源码扩展名组.has(path.extname(目录项.name)) === true) 文件组.push(绝对路径)
  }
  return 文件组
}

function 检查文件(文件: string): 违规项[] {
  let 相对路径 = path.relative(项目根目录, 文件).replaceAll('\\', '/')
  let 行组 = fs.readFileSync(文件, 'utf8').split(/\r?\n/u)
  let 结果: 违规项[] = []
  for (let 行号 = 0; 行号 < 行组.length; 行号 += 1) {
    let 内容 = 行组[行号]
    if (内容 === undefined) throw new Error(`读取 ${相对路径} 第 ${String(行号 + 1)} 行失败`)
    for (let 规则 of 规则组) {
      let 是任务准备器 = 相对路径.startsWith('scripts/task/prepare/')
      let 是允许项 = 允许规则表.get(相对路径)?.has(规则.编号) === true
      let 是准备器允许的交互 =
        是任务准备器 === true && ['TASK_INTERACTION_001', 'TASK_INTERACTION_003'].includes(规则.编号)
      if (规则.匹配.test(内容) === true && 是允许项 === true) 允许命中组.add(`${相对路径}:${规则.编号}`)
      if (规则.匹配.test(内容) === true && 是允许项 === false && 是准备器允许的交互 === false) {
        结果.push({ 文件: 相对路径, 行号: 行号 + 1, 编号: 规则.编号, 说明: 规则.说明, 内容: 内容.trim() })
      }
    }
  }
  return 结果
}

let 违规项组 = 扫描文件(脚本目录)
  .filter((文件) => path.resolve(文件) !== 当前文件)
  .flatMap(检查文件)
  .sort((左, 右) => {
    if (左.文件 !== 右.文件) return 左.文件.localeCompare(右.文件)
    let 行号差 = 左.行号 - 右.行号
    return 行号差 === 0 ? 左.编号.localeCompare(右.编号) : 行号差
  })

for (let [文件, 规则编号组] of 允许规则表) {
  for (let 规则编号 of 规则编号组) {
    if (允许命中组.has(`${文件}:${规则编号}`) === false) {
      throw new Error(`已审阅交互边界已经失效，请移除或更新: ${文件} ${规则编号}`)
    }
  }
}

if (违规项组.length > 0) {
  console.error(`发现 ${String(违规项组.length)} 处未纳入任务交互阶段管理的代码：`)
  for (let 违规项 of 违规项组) {
    console.error(`\n${违规项.编号} ${违规项.文件}:${String(违规项.行号)}`)
    console.error(`  ${违规项.说明}`)
    console.error(`  ${违规项.内容}`)
  }
  process.exitCode = 1
} else {
  console.log(`任务交互阶段检查通过（${String(允许规则表.size)} 个已审阅的交互边界）`)
}
