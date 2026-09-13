import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { 读取Node环境 } from './env-files-core.mjs'

export let 端口键组 = ['APP_PORT', 'WEB_PORT', 'WEB_HMR_PORT', 'TEST_APP_PORT', 'TEST_WEB_PORT', 'TEST_WEB_HMR_PORT']

function 是端口表(值) {
  return (
    typeof 值 === 'object' &&
    值 !== null &&
    端口键组.every((键) => Number.isInteger(值[键]) === true && 值[键] > 0 && 值[键] <= 65535)
  )
}

export function 读取端口状态(项目根目录) {
  let 状态路径 = path.resolve(项目根目录, '.setup-state.json')
  if (fs.existsSync(状态路径) === false) return null
  try {
    let 状态 = JSON.parse(fs.readFileSync(状态路径, 'utf8'))
    return 是端口表(状态?.ports) === true ? 状态.ports : null
  } catch (错误) {
    console.log(`[忽略] 无法读取 .setup-state.json 中的端口状态：${String(错误)}`)
    return null
  }
}

function 从环境文件读取端口(项目根目录, 文件相对路径, 变量名) {
  let 文件路径 = path.resolve(项目根目录, 文件相对路径)
  if (fs.existsSync(文件路径) === false) return null
  let 匹配结果 = new RegExp(`^${变量名}\\s*=\\s*(\\d+)`, 'mu').exec(fs.readFileSync(文件路径, 'utf8'))
  let 端口 = Number(匹配结果?.[1])
  return Number.isInteger(端口) ? 端口 : null
}

export function 推断已有端口表(项目根目录, 环境文件组) {
  let 已有环境文件组 = 环境文件组
    .filter((文件) => fs.existsSync(path.resolve(项目根目录, 文件)) === true)
    .map((文件) => ({ 文件, Node环境: 读取Node环境(path.resolve(项目根目录, 文件)) }))
  let 常规环境文件 = 已有环境文件组.find((环境文件) => 环境文件.Node环境 !== 'test')?.文件
  let 测试环境文件 = 已有环境文件组.find((环境文件) => 环境文件.Node环境 === 'test')?.文件
  if (常规环境文件 === undefined || 测试环境文件 === undefined) return null
  let 端口表 = {
    APP_PORT: 从环境文件读取端口(项目根目录, 常规环境文件, 'APP_PORT'),
    WEB_PORT: 从环境文件读取端口(项目根目录, 常规环境文件, 'WEB_PORT'),
    WEB_HMR_PORT: 从环境文件读取端口(项目根目录, 常规环境文件, 'WEB_HMR_PORT'),
    TEST_APP_PORT: 从环境文件读取端口(项目根目录, 测试环境文件, 'APP_PORT'),
    TEST_WEB_PORT: 从环境文件读取端口(项目根目录, 测试环境文件, 'WEB_PORT'),
    TEST_WEB_HMR_PORT: 从环境文件读取端口(项目根目录, 测试环境文件, 'WEB_HMR_PORT'),
  }
  return 是端口表(端口表) === true ? 端口表 : null
}

async function 获得空闲端口(起始端口) {
  return new Promise((resolve) => {
    let 服务器 = net.createServer()
    服务器.unref()
    服务器.on('error', () => resolve(获得空闲端口(起始端口 + 1)))
    服务器.listen(起始端口, () => {
      let 地址 = 服务器.address()
      let 端口 = typeof 地址 === 'object' && 地址 !== null ? 地址.port : 起始端口
      服务器.close(() => resolve(端口))
    })
  })
}

export async function 生成随机端口表() {
  let 随机偏移 = Math.floor(Math.random() * 10000)
  let 应用端口 = await 获得空闲端口(30000 + 随机偏移)
  let Web端口 = await 获得空闲端口(应用端口 + 1)
  let Web热更新端口 = await 获得空闲端口(Web端口 + 1)
  let 测试应用端口 = await 获得空闲端口(Web热更新端口 + 1)
  let 测试Web端口 = await 获得空闲端口(测试应用端口 + 1)
  let 测试Web热更新端口 = await 获得空闲端口(测试Web端口 + 1)
  return {
    APP_PORT: 应用端口,
    WEB_PORT: Web端口,
    WEB_HMR_PORT: Web热更新端口,
    TEST_APP_PORT: 测试应用端口,
    TEST_WEB_PORT: 测试Web端口,
    TEST_WEB_HMR_PORT: 测试Web热更新端口,
  }
}

function 替换环境文件端口(项目根目录, 文件相对路径, 端口表) {
  let 文件路径 = path.resolve(项目根目录, 文件相对路径)
  if (fs.existsSync(文件路径) === false) return
  let 内容 = fs.readFileSync(文件路径, 'utf8')
  for (let [变量名, 端口] of Object.entries(端口表)) {
    内容 = 内容.replace(new RegExp(`^(${变量名}\\s*=\\s*)\\d+`, 'mu'), `$1${端口}`)
  }
  fs.writeFileSync(文件路径, 内容)
  console.log(`[完成] 已更新端口：${文件相对路径}`)
}

function 更新Docker端口(项目根目录, 应用端口) {
  let 部署目录 = path.resolve(项目根目录, 'deploy')
  let 部署环境目录组 = fs
    .readdirSync(部署目录, { withFileTypes: true })
    .filter((目录项) => 目录项.isDirectory() === true)
    .sort((左, 右) => 左.name.localeCompare(右.name))
  for (let 部署环境目录 of 部署环境目录组) {
    let Compose路径 = path.resolve(部署目录, 部署环境目录.name, 'docker-compose.yml')
    let Dockerfile路径 = path.resolve(部署目录, 部署环境目录.name, 'dockerfile')
    if (fs.existsSync(Compose路径) === true) {
      let 原内容 = fs.readFileSync(Compose路径, 'utf8')
      let 新内容 = 原内容.replace(/(^\s*#\s*setup-port:\s*app\s*\r?\n\s*-\s*"?\d+:)\d+("?)/gmu, `$1${应用端口}$2`)
      if (新内容 !== 原内容) fs.writeFileSync(Compose路径, 新内容)
    }
    if (fs.existsSync(Dockerfile路径) === true) {
      let 原内容 = fs.readFileSync(Dockerfile路径, 'utf8')
      let 新内容 = 原内容.replace(/(^\s*#\s*setup-port:\s*app\s*\r?\n\s*EXPOSE\s+)\d+/gmu, `$1${应用端口}`)
      if (新内容 !== 原内容) fs.writeFileSync(Dockerfile路径, 新内容)
    }
  }
  console.log(`[完成] 已同步 Docker 端口：${应用端口}`)
}

export function 应用端口表(项目根目录, 环境文件组, 端口表) {
  for (let 环境文件 of 环境文件组) {
    let 环境文件路径 = path.resolve(项目根目录, 环境文件)
    if (fs.existsSync(环境文件路径) === false) continue
    let 是否测试环境 = 读取Node环境(环境文件路径) === 'test'
    替换环境文件端口(
      项目根目录,
      环境文件,
      是否测试环境
        ? { APP_PORT: 端口表.TEST_APP_PORT, WEB_PORT: 端口表.TEST_WEB_PORT, WEB_HMR_PORT: 端口表.TEST_WEB_HMR_PORT }
        : { APP_PORT: 端口表.APP_PORT, WEB_PORT: 端口表.WEB_PORT, WEB_HMR_PORT: 端口表.WEB_HMR_PORT },
    )
  }
  更新Docker端口(项目根目录, 端口表.APP_PORT)
}

export function 写入端口状态(项目根目录, 端口表) {
  let 状态路径 = path.resolve(项目根目录, '.setup-state.json')
  let 默认状态 = {
    version: 1,
    status: 'configured',
    targets: ['web'],
    configureGitHubSecret: false,
    renameProject: false,
    initializeDevDatabase: true,
    devDatabaseInitializationPending: false,
  }
  let 现有状态 = 默认状态
  if (fs.existsSync(状态路径) === true) {
    try {
      let 原始状态 = JSON.parse(fs.readFileSync(状态路径, 'utf8'))
      if (typeof 原始状态 === 'object' && 原始状态 !== null) 现有状态 = { ...默认状态, ...原始状态 }
    } catch (错误) {
      console.log(`[忽略] 无法读取 .setup-state.json，将重建端口状态：${String(错误)}`)
    }
  }
  fs.writeFileSync(
    状态路径,
    `${JSON.stringify({ ...现有状态, version: 1, useRandomPorts: true, ports: 端口表 }, null, 2)}\n`,
  )
  console.log('[完成] 已同步 .setup-state.json 中的端口状态')
}
