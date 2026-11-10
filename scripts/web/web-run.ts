import type { ChildProcess } from 'child_process'
import crossSpawn from 'cross-spawn'
import dotenv from 'dotenv'
import { readdirSync } from 'fs'
import path from 'path'
import { 读取环境文件明文 } from '../setup/env-crypto-core.mjs'
import { ParcelWorker入口, ParcelWorker选项 } from '../task/model/task-common'

function getHtmlEntries(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    let entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return getHtmlEntries(entryPath)
    return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : []
  })
}

// 加载环境变量
let envFile = process.env['ENV_FILE_PATH']
if (envFile === undefined) {
  console.error('未提供 ENV_FILE_PATH 环境变量！为了避免前端打包到错误的配置，必须指定配置文件。')
  process.exit(1)
}
let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 已解密变量 = dotenv.parse(读取环境文件明文(项目根目录, envFile))
for (let [名称, 值] of Object.entries(已解密变量)) {
  if (process.env[名称] === undefined) process.env[名称] = 值
}

let 测试环境 = process.env['NODE_ENV'] === 'test'
let Web产物目录 = 测试环境 ? 'test-outputs/web-test-dev' : 'dist/src/web'

let Parcel进程列表: ChildProcess[] = []
let 正在重启 = false

function 启动任务(): void {
  let webPort = process.env['WEB_PORT']
  let hmrPort = process.env['WEB_HMR_PORT']
  if (webPort === undefined || hmrPort === undefined) {
    console.error('未在环境变量中提供 WEB_PORT 或 WEB_HMR_PORT！')
    process.exit(1)
  }

  正在重启 = false
  Parcel进程列表 = []
  if (process.env['BUILD_TARGET'] === 'pure-frontend') {
    let Worker进程 = crossSpawn(
      'parcel',
      [
        'watch',
        ...ParcelWorker选项,
        '--dist-dir',
        'dist/src/web/worker-assets',
        '--no-hmr',
        '--watch-for-stdin',
        ParcelWorker入口,
      ],
      { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true },
    )
    Parcel进程列表.push(Worker进程)
  }
  let Web进程 = crossSpawn(
    'parcel',
    [
      '--no-cache',
      '--no-autoinstall',
      ...(测试环境 ? ['--cache-dir', 'test-outputs/parcel-cache-test-dev'] : []),
      '--dist-dir',
      Web产物目录,
      '--watch-for-stdin',
      '--port',
      webPort,
      '--hmr-port',
      hmrPort,
      ...getHtmlEntries('src/web/page'),
      // '--lazy',
    ],
    // --watch-for-stdin uses the pipe to stop Parcel when this wrapper exits.
    { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true },
  )
  Parcel进程列表.push(Web进程)
  for (let Parcel进程 of Parcel进程列表) Parcel进程.on('close', 处理Parcel进程关闭)
}

function 处理Parcel进程关闭(): void {
  if (正在重启 === true) return
  正在重启 = true
  console.log('Parcel 进程已退出，正在重启开发前端。')
  for (let Parcel进程 of Parcel进程列表) Parcel进程.kill()
  setTimeout(() => 重启(), 1000)
}

function 重启(): void {
  if (测试环境 === true) {
    启动任务()
    return
  }
  let 清理进程 = crossSpawn('tsx', ['scripts/clean/clean-web.ts'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  })
  清理进程.on('close', (退出码) => {
    if (退出码 === 0) 启动任务()
    else {
      console.error('清理 Web 构建产物失败，稍后重试，退出码:', 退出码)
      setTimeout(() => 重启(), 1000)
    }
  })
}

function 结束开发进程(): void {
  正在重启 = true
  for (let Parcel进程 of Parcel进程列表) Parcel进程.kill()
  process.exit(0)
}

process.on('SIGINT', 结束开发进程)
process.on('SIGTERM', 结束开发进程)

启动任务()
