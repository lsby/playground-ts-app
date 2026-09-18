import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'

let __当前文件名 = fileURLToPath(import.meta.url)
let __当前目录名 = path.dirname(__当前文件名)
let 项目根目录 = path.resolve(__当前目录名, '../../')

let 包信息模式 = z.object({ scripts: z.record(z.string()).optional() }).passthrough()

async function 执行发布(): Promise<void> {
  let packageJsonPath = path.resolve(项目根目录, 'package.json')
  let 原始文本 = fs.readFileSync(packageJsonPath, 'utf8')
  let 已修改 = false

  let 恢复包信息 = (): void => {
    if (已修改 === true) {
      fs.writeFileSync(packageJsonPath, 原始文本, 'utf8')
      已修改 = false
    }
  }

  process.on('SIGINT', () => {
    恢复包信息()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    恢复包信息()
    process.exit(143)
  })

  try {
    console.log('🚀 开始 NPM 发布流程...')

    let 解析结果 = 包信息模式.parse(JSON.parse(原始文本))
    if (解析结果.scripts !== undefined) {
      // 移除仅供本地模板仓库开发使用的生命周期钩子，避免外部用户安装时找不到脚本报错
      delete 解析结果.scripts['preinstall']
      delete 解析结果.scripts['postinstall']
      delete 解析结果.scripts['prepare']

      fs.writeFileSync(packageJsonPath, `${JSON.stringify(解析结果, null, 2)}\n`, 'utf8')
      已修改 = true
    }

    console.log('📦 正在发布到 NPM...')
    execSync('npm publish --access public', { stdio: 'inherit', cwd: 项目根目录 })

    console.log('✨ NPM 发布成功！')
  } catch (错误) {
    console.error('❌ NPM 发布失败:', 错误)
    process.exit(1)
  } finally {
    恢复包信息()
  }
}

执行发布().catch(console.error)
