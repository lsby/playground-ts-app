import { execSync } from 'child_process'
import fs from 'fs'
import open from 'open'
import path from 'path'
import { fileURLToPath } from 'url'

let __当前文件名 = fileURLToPath(import.meta.url)
let __当前目录名 = path.dirname(__当前文件名)
let 项目根目录 = path.resolve(__当前目录名, '../../')
let 相对发布目录 = 'release/pure-frontend'
let 发布目录 = path.join(项目根目录, 相对发布目录)

function 确保目录存在(目录路径: string): void {
  if (!fs.existsSync(目录路径)) {
    fs.mkdirSync(目录路径, { recursive: true })
  }
}

/**
 * 递归复制文件夹
 */
function 递归复制(源路径: string, 目标路径: string): void {
  if (!fs.existsSync(源路径)) return
  if (!fs.existsSync(目标路径)) fs.mkdirSync(目标路径, { recursive: true })
  let 所有项 = fs.readdirSync(源路径, { withFileTypes: true })
  for (let 项 of 所有项) {
    let 项源路径 = path.join(源路径, 项.name)
    let 项目标路径 = path.join(目标路径, 项.name)
    if (项.isDirectory()) {
      递归复制(项源路径, 项目标路径)
    } else {
      fs.copyFileSync(项源路径, 项目标路径)
    }
  }
}

async function 执行构建(): Promise<void> {
  try {
    console.log('正在执行前置准备工作 (check, build)...')
    execSync('dotenv -e ./.env/.env.production.pure-frontend -- npm run _check:all', {
      stdio: 'inherit',
      cwd: 项目根目录,
    })
    execSync('dotenv -e ./.env/.env.production.pure-frontend -- npm run _build:web:pure-frontend', {
      stdio: 'inherit',
      cwd: 项目根目录,
    })

    console.log('[1/3] 正在准备发布目录...')
    if (fs.existsSync(发布目录) === true) {
      fs.rmSync(发布目录, { recursive: true, force: true })
    }
    确保目录存在(发布目录)

    console.log('[2/3] 正在收集编译产物...')
    // 纯前端模式只需要打包产出的 dist/src/web 以及可能需要的 public
    let web产物路径 = path.join(项目根目录, 'dist/src/web')
    if (!fs.existsSync(web产物路径)) {
      throw new Error(`未找到构建产物目录 ${web产物路径}，请确认构建是否成功。`)
    }

    // 我们将其内容放到 release/pure-frontend/ 目录
    递归复制(web产物路径, 发布目录)

    // 如果有 public 也一并拷贝
    let public路径 = path.join(项目根目录, 'public')
    if (fs.existsSync(public路径)) {
      递归复制(public路径, path.join(发布目录, 'public'))
    }

    console.log('[3/3] 正在生成部署说明...')
    let 说明内容 = [
      '# 纯前端模式部署说明',
      '',
      '这是一个完全由前端托管的应用产物（包含了所有的纯前端模拟层和 WASM-SQLite 数据库引擎）。',
      '你只需要将当前文件夹下的所有文件部署到任意的**静态文件服务器**（如 Nginx、Vercel、Github Pages 等）即可。',
      '',
      '**⚠️ 注意：**',
      '1. 必须在安全上下文（HTTPS 或 localhost）下运行。数据库通过 IndexedDB 持久化，并使用 Web Locks API 串行化不同标签页的本地 API 请求；部署前请确认目标浏览器支持 IndexedDB、Web Worker 和 Web Locks API。',
      '2. 数据按站点 Origin 隔离；更换协议、域名或端口会进入另一份本地数据库。',
      '3. 当前数据库后端不使用 OPFS 或 SharedArrayBuffer，无需配置 COOP/COEP 响应头。',
    ].join('\r\n')
    fs.writeFileSync(path.join(发布目录, '部署说明.md'), 说明内容)

    console.log('✅ 纯前端产物整理成功！')
    console.log(`成果物位置: ${发布目录}`)

    // 构建完成后打开文件夹
    try {
      await open(发布目录, { wait: true })
    } catch (_错误) {
      // 忽略打开失败
    }
  } catch (错误) {
    console.error('❌ 产物整理过程中发生错误:', 错误)
    process.exit(1)
  }
}

执行构建().catch(console.error)
