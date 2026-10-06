import { execFileSync } from 'child_process'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { 读取环境文件明文 } from '../setup/env-crypto-core.mjs'

export let 发布信息文件名 = 'release-info.json'

export let 发布信息模式 = z
  .object({
    schemaVersion: z.literal(1),
    gitCommit: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u),
    gitDirty: z.boolean(),
  })
  .strict()

export type 发布信息 = z.infer<typeof 发布信息模式>

let 发布配置模式 = z
  .object({ DEPLOY_ALLOW_DIRTY_GIT: z.enum(['true', 'false']).transform((值): boolean => 值 === 'true') })
  .passthrough()

function 执行Git命令(项目根目录: string, 参数组: string[]): string {
  return execFileSync('git', 参数组, { cwd: 项目根目录, encoding: 'utf8', windowsHide: true }).trim()
}

export function 创建发布信息(项目根目录: string, 环境文件路径: string): 发布信息 {
  let 环境文本 = 读取环境文件明文(项目根目录, 环境文件路径)
  let 发布配置 = 发布配置模式.parse(dotenv.parse(环境文本))
  let gitCommit = 执行Git命令(项目根目录, ['rev-parse', '--verify', 'HEAD'])
  let git状态 = 执行Git命令(项目根目录, ['status', '--porcelain=v1', '--untracked-files=all'])
  let gitDirty = git状态 !== ''

  if (gitDirty === true && 发布配置.DEPLOY_ALLOW_DIRTY_GIT === false) {
    throw new Error('Git 工作区或暂存区不干净，当前环境禁止部署 dirty 产物')
  }
  if (gitDirty === true) {
    console.warn('⚠️ 当前 Git 工作区或暂存区不干净，发布信息将标记 gitDirty=true')
  }

  return 发布信息模式.parse({ schemaVersion: 1, gitCommit, gitDirty })
}

export function 创建当前发布信息(项目根目录: string): 发布信息 {
  let 环境文件路径 = process.env['ENV_FILE_PATH']
  if (环境文件路径 === undefined || 环境文件路径 === '') {
    throw new Error('缺少 ENV_FILE_PATH，无法读取 DEPLOY_ALLOW_DIRTY_GIT')
  }
  return 创建发布信息(项目根目录, 环境文件路径)
}

export function 写入发布信息(目标目录: string, 发布信息: 发布信息): string {
  let 已校验发布信息 = 发布信息模式.parse(发布信息)
  fs.mkdirSync(目标目录, { recursive: true })
  let 文件路径 = path.join(目标目录, 发布信息文件名)
  fs.writeFileSync(文件路径, `${JSON.stringify(已校验发布信息, null, 2)}\n`, 'utf8')
  let 写入结果 = 发布信息模式.parse(JSON.parse(fs.readFileSync(文件路径, 'utf8')))
  if (JSON.stringify(写入结果) !== JSON.stringify(已校验发布信息)) {
    throw new Error(`发布信息写入校验失败: ${文件路径}`)
  }
  return 文件路径
}

export function 删除发布信息(目标目录: string): void {
  let 文件路径 = path.join(目标目录, 发布信息文件名)
  if (fs.existsSync(文件路径) === true) fs.rmSync(文件路径)
}
