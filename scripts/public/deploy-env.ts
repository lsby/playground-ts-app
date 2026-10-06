import dotenv from 'dotenv'
import path from 'path'
import { z } from 'zod'
import { 读取环境文件明文 } from '../setup/env-crypto-core.mjs'

export type 部署服务器配置 = {
  name: string
  host: string
  username: string
  password: string
  useMirror: boolean
  deployRootDir: string | null
}

let 服务器标识模式 = z.string().regex(/^[A-Z][A-Z0-9_]*$/u)
let 非空字符串 = z.string().min(1)

function 读取必需字段(环境变量: Record<string, string>, 名称: string): string {
  let 值 = 环境变量[名称]
  if (值 === undefined) throw new Error(`部署环境文件缺少字段: ${名称}`)
  return 值
}

export function 读取部署服务器配置(项目根目录: string): 部署服务器配置[] {
  let 文件路径 = path.resolve(项目根目录, '.env/.env.deploy')
  let 环境变量 = dotenv.parse(读取环境文件明文(项目根目录, 文件路径))
  let 标识组 = 读取必需字段(环境变量, 'DEPLOY_SERVER_IDS')
    .split(',')
    .map((值) => 服务器标识模式.parse(值.trim()))
  if (标识组.length === 0 || new Set(标识组).size !== 标识组.length) {
    throw new Error('DEPLOY_SERVER_IDS 必须包含至少一个不重复的服务器标识')
  }
  return 标识组.map((标识) => {
    let 前缀 = `DEPLOY_SERVER_${标识}_`
    let 镜像值 = 读取必需字段(环境变量, `${前缀}USE_MIRROR`)
    if (镜像值 !== 'true' && 镜像值 !== 'false') throw new Error(`${前缀}USE_MIRROR 必须是 true 或 false`)
    let 根目录 = 读取必需字段(环境变量, `${前缀}ROOT_DIR`)
    return {
      name: 非空字符串.parse(读取必需字段(环境变量, `${前缀}NAME`)),
      host: 非空字符串.parse(读取必需字段(环境变量, `${前缀}HOST`)),
      username: 非空字符串.parse(读取必需字段(环境变量, `${前缀}USERNAME`)),
      password: 非空字符串.parse(读取必需字段(环境变量, `${前缀}PASSWORD`)),
      useMirror: 镜像值 === 'true',
      deployRootDir: 根目录 === '' ? null : 根目录,
    }
  })
}
