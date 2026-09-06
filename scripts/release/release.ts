import { execSync } from 'child_process'
import fs from 'fs'
import { resolve } from 'path'
import { z } from 'zod'

let 项目根目录 = resolve(import.meta.dirname, '../../')

let 执行命令 = (命令: string, 描述: string): void => {
  console.log(`📦 ${描述}...`)
  try {
    execSync(命令, { cwd: 项目根目录, stdio: 'inherit', shell: process.platform === 'win32' ? 'cmd.exe' : 'bash' })
    console.log(`✅ ${描述}完成`)
  } catch (错误) {
    console.error(`❌ ${描述}失败:`, 错误)
    throw 错误
  }
}

let 获取版本号 = (): string => {
  let 包信息路径 = resolve(项目根目录, 'package.json')
  let 包信息模式 = z.object({ version: z.string() })
  let 包信息 = 包信息模式.parse(JSON.parse(fs.readFileSync(包信息路径, 'utf-8')))
  return 包信息.version
}

let 主程序 = (): void => {
  try {
    let 版本号 = 获取版本号()
    console.log(`\n🚀 开始发布流程: v${版本号}...\n`)

    // 步骤 1: 添加所有更改到 git
    执行命令('git add .', '添加文件到 git')

    // 步骤 2: 创建提交
    执行命令(`git commit -m "chore: release v${版本号}"`, '创建发布提交')

    // 步骤 3: 创建标签
    执行命令(`git tag v${版本号}`, '创建版本标签')

    // 步骤 4: 推送到远程
    执行命令('git push', '推送提交到远程')
    执行命令('git push --tags', '推送标签到远程')

    console.log('✨ 流程完成！')
  } catch (_错误) {
    console.error('❌ 流程中断，请检查上述错误信息')
    process.exit(1)
  }
}

主程序()
