import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { 加密环境文本, 发现正式环境文件, 生成项目密钥, 读取环境文件明文 } from './env-crypto-core.mjs'
import { 发现环境文件 } from './env-files-core.mjs'
import { 执行开发数据库初始化 } from './init-dev-database.mjs'
import { 应用端口表, 生成随机端口表, 读取初始化状态文件 } from './init-ports-core.mjs'
import { 执行项目重命名, 解析当前包名 } from './rename-project-core.mjs'
import { 打印初始化帮助, 解析初始化参数 } from './setup-options.mjs'

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 运行目标标识们 = ['web', 'pure-frontend', 'electron', 'sea', 'android', 'cli']
let 所有环境文件组 = 发现环境文件(项目根目录).map((环境文件) => 环境文件.本地文件)
let 初始化状态相对路径 = '.setup-state.json'

function 读取初始化状态() {
  let 原始状态 = 读取初始化状态文件(项目根目录)
  if (原始状态 === null) return null
  if (原始状态.targets.some((目标) => 运行目标标识们.includes(目标) === false) === true) {
    throw new Error(`${初始化状态相对路径} 包含未知运行目标`)
  }
  return {
    目标组: 原始状态.targets,
    是否配置GitHubSecret: 原始状态.configureGitHubSecret,
    是否启用环境加密: 原始状态.encryptConfig,
    是否使用随机端口: 原始状态.useRandomPorts,
    端口表: 原始状态.ports,
    是否重命名项目: 原始状态.renameProject,
    是否初始化开发数据库: 原始状态.initializeDevDatabase,
    是否等待初始化开发数据库: 原始状态.devDatabaseInitializationPending,
  }
}

function 写入初始化状态(状态, 状态名称) {
  let 可保存状态 = {
    version: 1,
    status: 状态名称,
    targets: 状态.目标组,
    configureGitHubSecret: 状态.是否配置GitHubSecret,
    encryptConfig: 状态.是否启用环境加密,
    useRandomPorts: 状态.是否使用随机端口,
    ports: 状态.端口表,
    renameProject: 状态.是否重命名项目,
    initializeDevDatabase: 状态.是否初始化开发数据库,
    devDatabaseInitializationPending: 状态.是否等待初始化开发数据库,
  }
  fs.writeFileSync(path.resolve(项目根目录, 初始化状态相对路径), `${JSON.stringify(可保存状态, null, 2)}\n`)
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

async function 获得确认值(询问器, 参数值, 消息, 默认值) {
  if (参数值 !== undefined) {
    console.log(`[参数] ${消息} ${参数值 === true ? '是' : '否'}`)
    return 参数值
  }
  if (询问器 === null) {
    console.log(`[默认] ${消息} ${默认值 === true ? '是' : '否'}`)
    return 默认值
  }
  return await 询问确认(询问器, 消息, 默认值)
}

async function 获得文本值(询问器, 参数值, 参数名, 消息, 默认值) {
  if (参数值 !== undefined) return 参数值
  if (询问器 === null) throw new Error(`非交互环境执行项目重命名时必须指定 ${参数名}`)
  return await 询问文本(询问器, 消息, 默认值)
}

function 获得GitHub仓库() {
  let 根目录结果 = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: 项目根目录,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (根目录结果.error instanceof Error || 根目录结果.status !== 0) return null
  let Git根目录 = 根目录结果.stdout.trim()
  if (Git根目录 === '' || path.relative(项目根目录, path.resolve(Git根目录)) !== '') return null
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

function 初始化全部配置() {
  let 缺失文件组 = [...所有环境文件组, '.env/.env.deploy'].filter(
    (文件) => fs.existsSync(path.resolve(项目根目录, 文件)) === false,
  )
  if (缺失文件组.length !== 0) throw new Error(`缺少必需环境文件: ${缺失文件组.join(', ')}`)
}

function 打印Secret手动说明(GitHub仓库) {
  console.log('\n可以稍后手动配置 GitHub Actions 项目密钥 Secret：')
  console.log(`  名称：PROJECT_CONFIG_KEY_FILE`)
  console.log(`  内容：.project-config.key 的完整原始内容`)
  console.log(`  页面：${GitHub仓库.页面地址}/settings/secrets/actions/new`)
  console.log(
    `  PowerShell：Get-Content -Raw .project-config.key | gh secret set PROJECT_CONFIG_KEY_FILE --repo ${GitHub仓库.仓库名称}`,
  )
}

function 配置项目密钥Secret(GitHub仓库) {
  let 环境文件路径 = path.resolve(项目根目录, '.project-config.key')
  let 结果 = spawnSync('gh', ['secret', 'set', 'PROJECT_CONFIG_KEY_FILE', '--repo', GitHub仓库.仓库名称], {
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
  console.log(`[完成] 已配置 ${GitHub仓库.仓库名称} 的 Actions Secret：PROJECT_CONFIG_KEY_FILE`)
}

function 启用环境加密() {
  生成项目密钥(项目根目录)
  for (let 相对路径 of 发现正式环境文件(项目根目录)) {
    let 文件路径 = path.resolve(项目根目录, 相对路径)
    let 原始内容 = fs.readFileSync(文件路径, 'utf8')
    if (/^CONFIG_ENCRYPTION\s*=\s*true\s*$/mu.test(原始内容) === true) continue
    let 明文内容 = 读取环境文件明文(项目根目录, 文件路径)
    fs.writeFileSync(文件路径, 加密环境文本({ 项目根目录, 文件路径, 明文内容 }))
    console.log(`[完成] 已加密：${相对路径}`)
  }
}

function 停用环境加密() {
  for (let 相对路径 of 发现正式环境文件(项目根目录)) {
    let 文件路径 = path.resolve(项目根目录, 相对路径)
    let 原始内容 = fs.readFileSync(文件路径, 'utf8')
    if (/^CONFIG_ENCRYPTION\s*=\s*false\s*$/mu.test(原始内容) === true) continue
    fs.writeFileSync(文件路径, 读取环境文件明文(项目根目录, 文件路径))
    console.log(`[完成] 已恢复明文：${相对路径}`)
  }
}

async function 运行初始化向导() {
  let 参数 = 解析初始化参数(process.argv.slice(2))
  if (参数.显示帮助 === true) {
    打印初始化帮助()
    return
  }
  let 可交互 = process.env.CI !== 'true' && process.stdin.isTTY === true && process.stdout.isTTY === true
  let 是否显式运行 = 参数.强制运行 === true || 参数.执行初始化 === true
  if (可交互 === false && 是否显式运行 === false && 参数.执行初始化 !== false) return
  let 上次状态 = 读取初始化状态()
  if (是否显式运行 === false && 上次状态 !== null) return
  let 询问器 = 可交互 ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
  try {
    console.log(是否显式运行 ? '\n项目初始化向导' : '\n项目依赖安装前初始化')
    console.log('====================')
    if (
      参数.执行初始化 === false ||
      (是否显式运行 === false &&
        (await 获得确认值(询问器, 参数.执行初始化, '是否开始项目初始化流程？选择否将直接继续安装依赖。', true)) ===
          false)
    ) {
      写入初始化状态(
        上次状态 ?? {
          目标组: ['web'],
          是否配置GitHubSecret: false,
          是否启用环境加密: false,
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

    // 运行目标不影响初始化结果，仅保留旧状态值以维持当前状态文件契约。
    let 目标组 = 上次状态?.目标组 ?? ['web']

    let GitHub仓库 = 获得GitHub仓库()
    if (GitHub仓库 === null) console.log('[跳过] 未检测到 GitHub origin，不修改 package.json repository')
    else 同步包仓库字段(GitHub仓库)

    初始化全部配置()
    let 是否使用随机端口 = await 获得确认值(
      询问器,
      参数.使用随机端口,
      '是否使用随机端口并同步全部环境与 Docker 配置？',
      上次状态?.是否使用随机端口 ?? true,
    )
    let 端口表 = 上次状态?.端口表 ?? null
    if (是否使用随机端口 === true) {
      if (端口表 === null && 参数.重新生成端口 === false) {
        throw new Error('当前没有可复用的端口表，不能使用 --no-regenerate-ports')
      }
      let 是否重新生成端口 =
        端口表 === null
          ? true
          : await 获得确认值(询问器, 参数.重新生成端口, '已存在上次分配的端口，是否重新生成？', false)
      if (是否重新生成端口 === true) 端口表 = await 生成随机端口表()
      应用端口表(项目根目录, 所有环境文件组, 端口表)
    } else if (参数.重新生成端口 === true) {
      throw new Error('--regenerate-ports 与 --no-random-ports 不能同时使用')
    }

    let 是否启用环境加密 = await 获得确认值(
      询问器,
      参数.启用环境加密,
      '是否启用项目环境文件加密？',
      上次状态?.是否启用环境加密 ?? true,
    )
    if (是否启用环境加密 === true) 启用环境加密()
    else 停用环境加密()

    let 是否配置GitHubSecret = false
    if (GitHub仓库 !== null && 是否启用环境加密 === true) {
      是否配置GitHubSecret = await 获得确认值(
        询问器,
        参数.配置GitHubSecret,
        '是否将项目配置密钥写入 GitHub Actions Secret？',
        上次状态?.是否配置GitHubSecret ?? false,
      )
    } else if (参数.配置GitHubSecret === true) {
      throw new Error(
        GitHub仓库 === null
          ? '已指定 --github-secret，但未检测到 GitHub origin'
          : '未启用环境加密时不能配置项目密钥 Secret',
      )
    }

    let 是否初始化开发数据库 = await 获得确认值(
      询问器,
      参数.初始化开发数据库,
      '是否初始化开发数据库？',
      上次状态?.是否初始化开发数据库 ?? true,
    )

    let 当前名称 = 解析当前包名(项目根目录)
    let 默认重命名 = 当前名称.作者名 === 'lsby' && 当前名称.项目名 === 'playground-ts-app'
    let 是否重命名项目 = await 获得确认值(
      询问器,
      参数.重命名项目,
      '是否重命名项目？',
      上次状态?.是否重命名项目 ?? 默认重命名,
    )
    if (是否重命名项目 === true) {
      let 新作者名 = await 获得文本值(询问器, 参数.新作者名, '--new-author', '新的作者名：', 当前名称.作者名)
      let 新项目名 = await 获得文本值(询问器, 参数.新项目名, '--new-project', '新的项目名：', 当前名称.项目名)
      if (/^[a-z0-9-]+$/u.test(新作者名) === false || /^[a-z0-9-]+$/u.test(新项目名) === false) {
        console.log('[跳过] 作者名和项目名只能包含小写字母、数字和短横线')
      } else if (新作者名 === 当前名称.作者名 && 新项目名 === 当前名称.项目名) {
        console.log('[跳过] 项目名称没有变化')
      } else if (
        (await 获得确认值(
          询问器,
          参数.确认重命名,
          `确认将项目从 "@${当前名称.作者名}/${当前名称.项目名}" 重命名为 "@${新作者名}/${新项目名}"？`,
          false,
        )) === true
      ) {
        执行项目重命名({ 项目根目录, 新作者名, 新项目名 })
      }
    }
    if (GitHub仓库 !== null && 是否配置GitHubSecret === true) 配置项目密钥Secret(GitHub仓库)
    let 新状态 = {
      目标组,
      是否配置GitHubSecret,
      是否启用环境加密,
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
    询问器?.close()
  }
}

try {
  await 运行初始化向导()
} catch (错误) {
  if (错误 instanceof Error && 错误.name === 'AbortError') console.log('\n已取消初始化。')
  else throw 错误
}
