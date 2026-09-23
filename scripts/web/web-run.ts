import type { ChildProcess } from 'child_process'
import crossSpawn from 'cross-spawn'
import { config } from 'dotenv'
import { readdirSync, writeFileSync } from 'fs'
import path from 'path'
import { ParcelWorker入口, ParcelWorker选项 } from '../task/task-common'

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
config({ path: envFile })

// 根据 APP_PORT 动态写入 .proxyrc.json 供 Parcel 代理使用
let appPort = process.env['APP_PORT'] ?? '3000'
let proxyConfig = {
  '/api': { target: `http://127.0.0.1:${appPort}`, changeOrigin: true },
  '/ws': { target: `ws://127.0.0.1:${appPort}`, ws: true, changeOrigin: true },
  '/public': { target: `http://127.0.0.1:${appPort}`, changeOrigin: true },
}
writeFileSync('.proxyrc.json', JSON.stringify(proxyConfig, null, 2), 'utf-8')

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
    { stdio: 'inherit' },
  )
  let Web进程 = crossSpawn(
    'parcel',
    [
      '--no-cache',
      '--no-autoinstall',
      '--dist-dir',
      'dist/src/web',
      '--watch-for-stdin',
      '--port',
      webPort,
      '--hmr-port',
      hmrPort,
      ...getHtmlEntries('src/web/page'),
      // '--lazy',
    ],
    { stdio: 'inherit' },
  )
  Parcel进程列表 = [Worker进程, Web进程]
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
  let 清理进程 = crossSpawn('tsx', ['scripts/clean/clean-web.ts'], { stdio: 'inherit' })
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
