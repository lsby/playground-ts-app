import { execFileSync } from 'child_process'
import fs from 'fs'
import { resolve } from 'path'
import { z } from 'zod'

let 项目根目录 = resolve(import.meta.dirname, '../../')

let 执行Git = (参数: string[], 描述: string): void => {
  console.log(`📦 ${描述}...`)
  try {
    execFileSync('git', 参数, { cwd: 项目根目录, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true })
    console.log(`✅ ${描述}完成`)
  } catch (错误) {
    console.error(`❌ ${描述}失败:`, 错误)
    throw 错误
  }
}

let 获取版本号 = (): string => {
  let 包信息路径 = resolve(项目根目录, 'package.json')
  let 包信息模式 = z
    .object({ version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u) })
    .passthrough()
  let 包信息 = 包信息模式.parse(JSON.parse(fs.readFileSync(包信息路径, 'utf-8')))
  return 包信息.version
}

let 主程序 = (): void => {
  try {
    let 版本号 = 获取版本号()
    console.log(`\n🚀 开始发布流程: v${版本号}...\n`)

    if (process.argv.includes('--push-only') === false) {
      执行Git(['add', '.'], '添加文件到 git')
      执行Git(['commit', '-m', `chore: release v${版本号}`], '创建发布提交')
      执行Git(['tag', `v${版本号}`], '创建版本标签')
    }
    执行Git(['push'], '推送提交到远程')
    执行Git(['push', 'origin', `refs/tags/v${版本号}`], '推送本次版本标签到远程')

    console.log('版本标签已推送，可查看仓库配置的后续发布任务。')

    console.log('✨ 流程完成！')
  } catch (_错误) {
    console.error('❌ 流程中断，请检查上述错误信息')
    process.exit(1)
  }
}

主程序()
