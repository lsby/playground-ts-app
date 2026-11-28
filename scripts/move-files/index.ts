import { execFileSync } from 'child_process'
import crossSpawn from 'cross-spawn'
import fs from 'fs'
import path from 'path'
import { Project } from 'ts-morph'
import { fileURLToPath } from 'url'
import { 按前缀生成计划, 校验项目内路径, 由命令行生成搬移表, 由计划文件生成搬移表, type 搬移表 } from './plan'
import { 创建根路径替换器, 改写文档相对路径, 改写相对引用, 源码文件表 } from './rewrite'

let 项目根目录 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
let 文本扩展名 = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.md',
  '.json',
  '.jsonc',
  '.yml',
  '.yaml',
  '.html',
  '.sh',
  '.txt',
  '.toml',
  '.py',
  '.css',
  '.xml',
  '.plist',
  '.gradle',
  '.kts',
  '.swift',
  '.kt',
  '.ets',
])
let 跳过的目录前缀 = ['.external-lfs/', 'node_modules/']
let 跳过的文件 = new Set(['pnpm-lock.yaml'])

let 用法 = `用法:
  npm run task -- files:move -- [--dry-run] <来源...> <目标>
  npm run task -- files:move -- [--dry-run] --plan <计划.json>
  npm run task -- files:plan -- <目录> [--strip <文件名前缀>] [--min <最少文件数>] [--out <计划.json>]

来源可以是文件, 目录或通配符; 目标以 / 结尾或已是目录时放进去, 否则视为改名.
计划文件是 [["来源", "目标"], ...] 形式的 JSON 数组, 规则同上.`

type 待写文件 = { 去处: string; 内容: string }

function 读取已入库文件(): Set<string> {
  let 输出 = execFileSync('git', ['ls-files', '-z'], {
    cwd: 项目根目录,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
  })
  return new Set(
    输出
      .split('\0')
      .filter((相对路径) => 相对路径 !== '')
      .map((相对路径) => path.resolve(项目根目录, 相对路径)),
  )
}

function 读取未入库文件(): Set<string> {
  let 输出 = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd: 项目根目录,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
  })
  return new Set(
    输出
      .split('\0')
      .filter((项) => 项 !== '')
      .map((项) => path.resolve(项目根目录, 项)),
  )
}

function 需要扫描文本(绝对路径: string): boolean {
  let 相对路径 = path.relative(项目根目录, 绝对路径).split(path.sep).join('/')
  if (跳过的目录前缀.some((前缀) => 相对路径.startsWith(前缀) === true) === true) return false
  if (跳过的文件.has(path.basename(相对路径)) === true) return false
  return 文本扩展名.has(path.extname(相对路径)) === true
}

function 计算待写文件(表: 搬移表, 已入库: Set<string>): { 待写: 待写文件[]; 改动引用数: number; 警告: string[] } {
  let 项目 = new Project({ tsConfigFilePath: path.join(项目根目录, 'tsconfig.json') })
  let 候选 = new Set([
    ...已入库,
    ...读取未入库文件(),
    ...项目.getSourceFiles().map((文件) => path.resolve(文件.getFilePath())),
    ...表.keys(),
  ])
  for (let 文件 of 候选) {
    if (需要扫描文本(文件) === false || /\.[cm]?[jt]sx?$/u.test(文件) === false || fs.existsSync(文件) === false)
      continue
    if (fs.lstatSync(文件).isSymbolicLink() === true) continue
    校验项目内路径(项目根目录, 文件)
    项目.addSourceFileAtPath(文件)
  }
  let 报告 = 改写相对引用(项目, 表)
  let 替换 = 创建根路径替换器(项目根目录, 表)
  let 源码 = 源码文件表(项目)
  let 待写: 待写文件[] = []
  for (let 原路径 of 候选) {
    if (需要扫描文本(原路径) === false || fs.existsSync(原路径) === false) continue
    if (fs.lstatSync(原路径).isSymbolicLink() === true) continue
    校验项目内路径(项目根目录, 原路径)
    let 原内容 = fs.readFileSync(原路径, 'utf8')
    let 源码文件 = 源码.get(原路径)
    let 新内容 = 替换(源码文件 === undefined ? 改写文档相对路径(原内容, 原路径, 表) : 源码文件.getFullText())
    if (新内容 === 原内容) continue
    待写.push({ 去处: 表.get(原路径) ?? 原路径, 内容: 新内容 })
  }
  return { 待写, 改动引用数: 报告.改动引用数, 警告: 报告.警告 }
}

function 删除空目录(起点: string): void {
  let 目录 = 起点
  while (
    目录.startsWith(项目根目录 + path.sep) === true &&
    fs.existsSync(目录) === true &&
    fs.readdirSync(目录).length === 0
  ) {
    fs.rmdirSync(目录)
    目录 = path.dirname(目录)
  }
}

function 执行搬移(表: 搬移表, 已入库: Set<string>, 待写: 待写文件[]): void {
  for (let [旧路径, 新路径] of 表) {
    fs.mkdirSync(path.dirname(新路径), { recursive: true })
    if (已入库.has(旧路径) === true) {
      execFileSync('git', ['mv', '--', 旧路径, 新路径], { cwd: 项目根目录 })
      continue
    }
    fs.renameSync(旧路径, 新路径)
  }
  for (let 文件 of 待写) fs.writeFileSync(文件.去处, 文件.内容)
  for (let 旧路径 of 表.keys()) 删除空目录(path.dirname(旧路径))
}

/** 路径变长或变短后 import 的换行和排序会变, 改过的文件统一过一遍 prettier. */
function 格式化(待写: 待写文件[]): void {
  let prettier = path.join(项目根目录, 'node_modules', '.bin', 'prettier')
  let 文件列表 = 待写.map((文件) => 文件.去处)
  for (let 起点 = 0; 起点 < 文件列表.length; 起点 += 200) {
    let 结果 = crossSpawn.sync(
      prettier,
      ['--write', '--ignore-unknown', '--log-level', 'warn', ...文件列表.slice(起点, 起点 + 200)],
      { cwd: 项目根目录, stdio: ['ignore', 'inherit', 'inherit'] },
    )
    if (结果.error instanceof Error) throw 结果.error
    if (结果.status !== 0) throw new Error(`搬移后的格式化失败，退出码：${String(结果.status)}`)
  }
}

function 相对(绝对路径: string): string {
  return path.relative(项目根目录, 绝对路径)
}

function 取选项(参数: string[], 名称: string): string | null {
  let 位置 = 参数.indexOf(名称)
  if (位置 === -1) return null
  let 值 = 参数[位置 + 1]
  if (值 === undefined) throw new Error(`${名称} 后面缺少值`)
  参数.splice(位置, 2)
  return 值
}

function 生成计划(参数: string[]): void {
  let 去掉前缀 = 取选项(参数, '--strip') ?? ''
  let 最少文件数 = Number(取选项(参数, '--min') ?? '3')
  let 输出文件 = 取选项(参数, '--out')
  let 目录 = 参数[0]
  if (目录 === undefined || 参数.length !== 1 || Number.isInteger(最少文件数) === false || 最少文件数 < 1)
    throw new Error(用法)
  let 内容 = JSON.stringify(按前缀生成计划(项目根目录, 目录, 去掉前缀, 最少文件数), null, 2)
  if (输出文件 === null) return console.log(内容)
  let 目标 = path.resolve(项目根目录, 输出文件)
  校验项目内路径(项目根目录, 目标)
  fs.writeFileSync(目标, 内容 + '\n', { flag: 'wx' })
  console.log(`计划已写入 ${输出文件}, 检查修改后用 files:move -- --plan ${输出文件} 执行`)
}

function 搬移(参数: string[]): void {
  let 演练位置 = 参数.indexOf('--dry-run')
  let 只演练 = 演练位置 !== -1
  if (只演练 === true) 参数.splice(演练位置, 1)
  let 计划文件 = 取选项(参数, '--plan')
  let 表 = 计划文件 === null ? 由命令行生成搬移表(项目根目录, 参数) : 由计划文件生成搬移表(项目根目录, 计划文件)
  if (表.size === 0) throw new Error('没有要搬的文件')

  let 已入库 = 读取已入库文件()
  let { 待写, 改动引用数, 警告 } = 计算待写文件(表, 已入库)
  let 仅改内容 = 待写.filter((文件) => [...表.values()].includes(文件.去处) === false)

  console.log(`搬移文件 ${表.size} 个, 改写相对引用 ${改动引用数} 处, 另有 ${仅改内容.length} 个没搬的文件内容被改动`)
  for (let [旧路径, 新路径] of [...表].slice(0, 30)) console.log(`  ${相对(旧路径)} -> ${相对(新路径)}`)
  if (表.size > 30) console.log(`  ... 其余 ${表.size - 30} 个省略`)
  for (let 文件 of 仅改内容.slice(0, 30)) console.log(`  改内容: ${相对(文件.去处)}`)
  if (仅改内容.length > 30) console.log(`  ... 其余 ${仅改内容.length - 30} 个省略`)
  for (let 条 of 警告) console.warn(`警告: ${条}`)

  if (只演练 === true) {
    console.log('演练模式, 没有写盘')
    return
  }
  if (警告.length > 0) throw new Error('存在未解析的路径引用，请修正后重新执行搬移')
  执行搬移(表, 已入库, 待写)
  格式化(待写)
  console.log('完成. 接着运行 npm run task -- generate:all 和 npm run task -- check:type, 按报错收尾')
}

function 主函数(): void {
  let [子命令, ...参数] = process.argv.slice(2)
  if (子命令 === 'move') return 搬移(参数)
  if (子命令 === 'plan') return 生成计划(参数)
  throw new Error(用法)
}

主函数()
