import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { 发现环境文件 } from './env-files-core.mjs'
import { 执行开发数据库初始化 } from './init-dev-database.mjs'
import { 应用端口表, 推断已有端口表, 生成随机端口表, 端口键组 } from './init-ports-core.mjs'
import { 执行项目重命名, 解析当前包名 } from './rename-project-core.mjs'

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 目标定义组 = [
  { id: 'web', 名称: 'Web 服务', 说明: 'Node.js 服务端与浏览器前端' },
  { id: 'pure-frontend', 名称: '纯前端', 说明: '浏览器 Worker 与本地 WASM SQLite' },
  { id: 'electron', 名称: 'Electron', 说明: '桌面应用与 GitHub Release' },
  { id: 'sea', 名称: 'SEA', 说明: 'Node.js 单文件可执行程序' },
  { id: 'android', 名称: 'Android', 说明: 'Capacitor 容器与纯前端构建' },
  { id: 'cli', 名称: 'CLI', 说明: '命令行应用' },
]
let 环境示例文件组 = 发现环境文件(项目根目录)
let 所有环境文件组 = 环境示例文件组.map((环境文件) => 环境文件.本地文件)
let Electron生产环境文件 = '.env/.env.production.electron'
let 初始化状态相对路径 = '.setup-state.json'

function 读取初始化状态() {
  let 状态路径 = path.resolve(项目根目录, 初始化状态相对路径)
  if (fs.existsSync(状态路径) === false) return null
  try {
    let 原始状态 = JSON.parse(fs.readFileSync(状态路径, 'utf8'))
    if (typeof 原始状态 !== 'object' || 原始状态 === null) return null
    let 有效目标组 = Array.isArray(原始状态.targets)
      ? 原始状态.targets.filter((目标) => 目标定义组.some((定义) => 定义.id === 目标))
      : []
    let 原始端口表 = typeof 原始状态.ports === 'object' && 原始状态.ports !== null ? 原始状态.ports : null
    let 端口表 = 原始端口表 !== null && 端口键组.every((键) => Number.isInteger(原始端口表[键])) ? 原始端口表 : null
    return {
      目标组: 有效目标组.length > 0 ? 有效目标组 : ['web'],
      是否配置GitHubSecret: 原始状态.configureGitHubSecret === true,
      是否使用随机端口: 原始状态.useRandomPorts !== false,
      端口表,
      是否重命名项目: 原始状态.renameProject === true,
      是否初始化开发数据库: 原始状态.initializeDevDatabase !== false,
      是否等待初始化开发数据库: 原始状态.devDatabaseInitializationPending === true,
    }
  } catch (错误) {
    console.log(`[忽略] 无法读取 ${初始化状态相对路径}：${String(错误)}`)
    return null
  }
}

function 写入初始化状态(状态, 状态名称) {
  let 可保存状态 = {
    version: 1,
    status: 状态名称,
    targets: 状态.目标组,
    configureGitHubSecret: 状态.是否配置GitHubSecret,
    useRandomPorts: 状态.是否使用随机端口,
    ports: 状态.端口表,
    renameProject: 状态.是否重命名项目,
    initializeDevDatabase: 状态.是否初始化开发数据库,
    devDatabaseInitializationPending: 状态.是否等待初始化开发数据库,
  }
  fs.writeFileSync(path.resolve(项目根目录, 初始化状态相对路径), `${JSON.stringify(可保存状态, null, 2)}\n`)
}

function 是否已有本地配置() {
  return (
    所有环境文件组.some((环境文件) => fs.existsSync(path.resolve(项目根目录, 环境文件)) === true) ||
    fs.existsSync(path.resolve(项目根目录, 'deploy/servers.local.json')) === true
  )
}

function 读取确认输入(内容, 默认值) {
  let 标准化内容 = 内容.trim().toLowerCase()
  if (标准化内容 === '') return 默认值
  return 标准化内容 === 'y' || 标准化内容 === 'yes' || 标准化内容 === '是'
}

async function 询问确认(询问器, 消息, 默认值) {
  let 后缀 = 默认值 === true ? '[Y/n]' : '[y/N]'
  return 读取确认输入(await 询问器.question(`? ${消息} ${后缀} `), 默认值)
}

async function 询问文本(询问器, 消息, 默认值) {
  let 内容 = (await 询问器.question(`? ${消息} [${默认值}] `)).trim()
  return 内容 === '' ? 默认值 : 内容
}

async function 询问目标组(询问器, 默认目标组) {
  console.log('\n请选择项目需要的运行目标，可输入多个编号并用逗号分隔：')
  for (let 索引 = 0; 索引 < 目标定义组.length; 索引 += 1) {
    let 目标 = 目标定义组[索引]
    if (目标 !== undefined) console.log(`  ${索引 + 1}. ${目标.名称} - ${目标.说明}`)
  }
  let 默认编号 = 默认目标组.map((目标) => 目标定义组.findIndex((定义) => 定义.id === 目标) + 1).join(',')
  while (true) {
    let 输入 = (await 询问器.question(`? 目标 [${默认编号}] `)).trim()
    let 编号组 = (输入 === '' ? 默认编号.split(',') : 输入.split(/[,，\s]+/u)).filter((编号) => 编号 !== '')
    let 索引组 = [...new Set(编号组.map((编号) => Number(编号) - 1))]
    if (索引组.length > 0 && 索引组.every((索引) => Number.isInteger(索引) && 目标定义组[索引] !== undefined)) {
      return 索引组.map((索引) => 目标定义组[索引].id)
    }
    console.log(`请输入 1 到 ${目标定义组.length} 之间的编号，例如：1,3`)
  }
}

function 获得GitHub仓库() {
  let 结果 = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: 项目根目录, encoding: 'utf8', windowsHide: true })
  if (结果.error instanceof Error || 结果.status !== 0) return null
  let 远程地址 = 结果.stdout.trim()
  let 匹配结果 =
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(远程地址) ??
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(远程地址) ??
    /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(远程地址)
  let 所有者 = 匹配结果?.[1]
  let 仓库名 = 匹配结果?.[2]
  if (所有者 === undefined || 仓库名 === undefined) return null
  return { 远程地址, 仓库名称: `${所有者}/${仓库名}`, 页面地址: `https://github.com/${所有者}/${仓库名}` }
}

function 同步包仓库字段(GitHub仓库) {
  let 包文件路径 = path.join(项目根目录, 'package.json')
  let 包信息 = JSON.parse(fs.readFileSync(包文件路径, 'utf8'))
  let 当前地址 =
    typeof 包信息.repository === 'object' && 包信息.repository !== null && typeof 包信息.repository.url === 'string'
      ? 包信息.repository.url
      : null
  if (当前地址 === GitHub仓库.远程地址) {
    console.log(`[跳过] package.json 已指向 GitHub 仓库：${GitHub仓库.仓库名称}`)
    return
  }
  包信息.repository = { type: 'git', url: GitHub仓库.远程地址 }
  fs.writeFileSync(包文件路径, `${JSON.stringify(包信息, null, 2)}\n`)
  console.log(`[完成] 已写入 package.json repository：${GitHub仓库.远程地址}`)
}

function 从示例创建文件(示例相对路径, 本地相对路径) {
  let 示例路径 = path.resolve(项目根目录, 示例相对路径)
  let 本地路径 = path.resolve(项目根目录, 本地相对路径)
  if (fs.existsSync(本地路径) === true) {
    console.log(`[跳过] 已存在：${本地相对路径}`)
    return
  }
  if (fs.existsSync(示例路径) === false) throw new Error(`缺少配置示例：${示例相对路径}`)
  fs.mkdirSync(path.dirname(本地路径), { recursive: true })
  fs.copyFileSync(示例路径, 本地路径)
  console.log(`[完成] 已创建：${本地相对路径}`)
}

function 初始化全部配置() {
  for (let 环境示例文件 of 环境示例文件组) {
    let 本地文件 = 环境示例文件.本地文件
    从示例创建文件(环境示例文件.示例文件, 本地文件)
  }
  let 本地服务器配置 = path.resolve(项目根目录, 'deploy/servers.local.json')
  if (fs.existsSync(本地服务器配置) === true) console.log('[跳过] 已存在：deploy/servers.local.json')
  else {
    fs.copyFileSync(path.resolve(项目根目录, 'deploy/servers.example.json'), 本地服务器配置)
    console.log('[完成] 已创建：deploy/servers.local.json')
  }
}

function 打印Secret手动说明(GitHub仓库) {
  console.log('\n可以稍后手动配置 Electron GitHub Actions Secret：')
  console.log(`  名称：ELECTRON_ENV_FILE`)
  console.log(`  内容：${Electron生产环境文件} 的完整原始内容`)
  console.log(`  页面：${GitHub仓库.页面地址}/settings/secrets/actions/new`)
  console.log(
    `  PowerShell：Get-Content -Raw ${Electron生产环境文件} | gh secret set ELECTRON_ENV_FILE --repo ${GitHub仓库.仓库名称}`,
  )
}

function 配置ElectronSecret(GitHub仓库) {
  let 环境文件路径 = path.resolve(项目根目录, Electron生产环境文件)
  let 结果 = spawnSync('gh', ['secret', 'set', 'ELECTRON_ENV_FILE', '--repo', GitHub仓库.仓库名称], {
    cwd: 项目根目录,
    encoding: 'utf8',
    input: fs.readFileSync(环境文件路径, 'utf8'),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  if (结果.error instanceof Error || 结果.status !== 0) {
    let 错误消息 = 结果.error instanceof Error ? 结果.error.message : 结果.stderr.trim()
    console.log(`[未完成] GitHub Secret 自动配置失败：${错误消息 === '' ? '未知错误' : 错误消息}`)
    打印Secret手动说明(GitHub仓库)
    return
  }
  console.log(`[完成] 已配置 ${GitHub仓库.仓库名称} 的 Actions Secret：ELECTRON_ENV_FILE`)
}

async function 运行初始化向导() {
  if (process.env.CI === 'true' || process.stdin.isTTY !== true || process.stdout.isTTY !== true) return
  let 是否显式运行 = process.argv.includes('--force')
  let 上次状态 = 读取初始化状态()
  if (是否显式运行 === false && 上次状态 !== null) return
  if (是否显式运行 === false && 是否已有本地配置() === true) {
    初始化全部配置()
    let 已有端口表 = 推断已有端口表(项目根目录, 所有环境文件组)
    写入初始化状态(
      {
        目标组: ['web'],
        是否配置GitHubSecret: false,
        是否使用随机端口: 已有端口表 !== null,
        端口表: 已有端口表,
        是否重命名项目: false,
        是否初始化开发数据库: true,
        是否等待初始化开发数据库: false,
      },
      'migrated',
    )
    return
  }
  let 询问器 = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log(是否显式运行 ? '\n项目初始化向导' : '\n项目依赖安装前初始化')
    console.log('====================')
    if (
      是否显式运行 === false &&
      (await 询问确认(询问器, '是否开始项目初始化流程？选择否将直接继续安装依赖。', true)) === false
    ) {
      写入初始化状态(
        上次状态 ?? {
          目标组: ['web'],
          是否配置GitHubSecret: false,
          是否使用随机端口: true,
          端口表: null,
          是否重命名项目: false,
          是否初始化开发数据库: true,
          是否等待初始化开发数据库: false,
        },
        'skipped',
      )
      console.log('已跳过初始化，继续安装依赖。\n')
      return
    }

    let 目标组 = await 询问目标组(询问器, 上次状态?.目标组 ?? ['web'])
    console.log(`已选择：${目标组.map((目标) => 目标定义组.find((项) => 项.id === 目标)?.名称 ?? 目标).join('、')}`)

    let GitHub仓库 = 获得GitHub仓库()
    if (GitHub仓库 === null) console.log('[跳过] 未检测到 GitHub origin，不修改 package.json repository')
    else 同步包仓库字段(GitHub仓库)

    初始化全部配置()
    let 是否配置GitHubSecret = false
    if (GitHub仓库 !== null) {
      是否配置GitHubSecret = await 询问确认(
        询问器,
        '是否将 Electron 生产环境配置写入 GitHub Actions Secret？',
        上次状态?.是否配置GitHubSecret ?? false,
      )
    }

    let 是否使用随机端口 = await 询问确认(
      询问器,
      '是否使用随机端口并同步全部环境与 Docker 配置？',
      上次状态?.是否使用随机端口 ?? true,
    )
    let 端口表 = 上次状态?.端口表 ?? null
    if (是否使用随机端口 === true) {
      let 是否重新生成端口 =
        端口表 === null ? true : await 询问确认(询问器, '已存在上次分配的端口，是否重新生成？', false)
      if (是否重新生成端口 === true) 端口表 = await 生成随机端口表()
      应用端口表(项目根目录, 所有环境文件组, 端口表)
    }

    let 是否初始化开发数据库 = await 询问确认(询问器, '是否初始化开发数据库？', 上次状态?.是否初始化开发数据库 ?? true)

    let 当前名称 = 解析当前包名(项目根目录)
    let 默认重命名 = 当前名称.作者名 === 'lsby' && 当前名称.项目名 === 'playground-ts-app'
    let 是否重命名项目 = await 询问确认(询问器, '是否重命名项目？', 上次状态?.是否重命名项目 ?? 默认重命名)
    if (是否重命名项目 === true) {
      let 新作者名 = await 询问文本(询问器, '新的作者名：', 当前名称.作者名)
      let 新项目名 = await 询问文本(询问器, '新的项目名：', 当前名称.项目名)
      if (/^[a-z0-9-]+$/u.test(新作者名) === false || /^[a-z0-9-]+$/u.test(新项目名) === false) {
        console.log('[跳过] 作者名和项目名只能包含小写字母、数字和短横线')
      } else if (新作者名 === 当前名称.作者名 && 新项目名 === 当前名称.项目名) {
        console.log('[跳过] 项目名称没有变化')
      } else if (
        (await 询问确认(
          询问器,
          `确认将项目从 "@${当前名称.作者名}/${当前名称.项目名}" 重命名为 "@${新作者名}/${新项目名}"？`,
          false,
        )) === true
      ) {
        执行项目重命名({ 项目根目录, 新作者名, 新项目名 })
      }
    }
    if (GitHub仓库 !== null && 是否配置GitHubSecret === true) 配置ElectronSecret(GitHub仓库)
    let 新状态 = {
      目标组,
      是否配置GitHubSecret,
      是否使用随机端口,
      端口表,
      是否重命名项目,
      是否初始化开发数据库,
      是否等待初始化开发数据库: 是否初始化开发数据库,
    }
    写入初始化状态(新状态, 'completed')
    if (是否显式运行 === true && 是否初始化开发数据库 === true) {
      执行开发数据库初始化(项目根目录)
      新状态.是否等待初始化开发数据库 = false
      写入初始化状态(新状态, 'completed')
    }
    console.log(是否显式运行 ? '\n初始化向导完成。\n' : '\n初始化向导完成，继续安装依赖。\n')
  } finally {
    询问器.close()
  }
}

try {
  await 运行初始化向导()
} catch (错误) {
  if (错误 instanceof Error && 错误.name === 'AbortError') console.log('\n已取消初始化。')
  else throw 错误
}
