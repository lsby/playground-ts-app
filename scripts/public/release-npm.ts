import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

let __当前文件名 = fileURLToPath(import.meta.url)
let __当前目录名 = path.dirname(__当前文件名)
let 项目根目录 = path.resolve(__当前目录名, '../../')

async function 执行发布(): Promise<void> {
  try {
    console.log('🚀 开始 NPM 发布流程...')

    console.log('正在执行前置准备工作 (db:push, check, build)...')
    execSync('npm run db:push:prod:web', { stdio: 'inherit', cwd: 项目根目录 })
    execSync('dotenv -e ./.env/.env.production.web -- npm run _check:all', { stdio: 'inherit', cwd: 项目根目录 })
    execSync('dotenv -e ./.env/.env.production.web -- npm run _build:all', { stdio: 'inherit', cwd: 项目根目录 })

    console.log('📦 正在发布到 NPM...')
    execSync('npm publish --access public', { stdio: 'inherit', cwd: 项目根目录 })

    console.log('✨ NPM 发布成功！')
  } catch (错误) {
    console.error('❌ NPM 发布失败:', 错误)
    process.exit(1)
  }
}

执行发布().catch(console.error)
