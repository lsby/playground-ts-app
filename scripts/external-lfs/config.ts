import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { 读取环境文件明文 } from '../setup/env-crypto-core.mjs'
import { type 外挂LFS配置, 外挂LFS配置Schema, type 目标云凭据, 纯COS凭据Schema, 纯OSS凭据Schema } from './model'

export let 项目根目录 = path.resolve(import.meta.dirname, '../..')

function 解析JSON文件(文件路径: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(文件路径, 'utf8'))
  } catch (错误) {
    throw new Error(`无法解析 JSON 文件: ${文件路径}`, { cause: 错误 })
  }
}

export function 读取配置(配置参数?: string): { 配置: 外挂LFS配置; 配置路径: string } {
  let 配置路径 = path.resolve(项目根目录, 配置参数 ?? '.external-lfs/config.json')
  if (fs.existsSync(配置路径) === false) throw new Error(`找不到外挂 LFS 配置: ${配置路径}`)
  let 配置 = 外挂LFS配置Schema.parse(解析JSON文件(配置路径))
  let 范围组 = 配置.managedPaths.map((项) => 项.scope)
  if (new Set(范围组).size !== 范围组.length) throw new Error('managedPaths 的 scope 不能重复')
  if (配置.keyFile !== '.project-config.key') throw new Error('第一版仅支持根目录 .project-config.key')
  return { 配置, 配置路径 }
}

export function 读取云凭据(配置: 外挂LFS配置, 目标名称: string): 目标云凭据 {
  let 文件路径 = path.resolve(项目根目录, 配置.credentialsFile)
  if (fs.existsSync(文件路径) === false) {
    throw new Error(`找不到云存储凭据文件: ${文件路径}\n请按 doc/framework/external-lfs.md 创建并加密它。`)
  }
  let 目标配置 = 配置.targets[目标名称]
  if (目标配置 === undefined) {
    throw new Error(`未声明的存储目标: ${目标名称}`)
  }
  let 内容 = 读取环境文件明文(项目根目录, 文件路径)
  let 环境字段 = dotenv.parse(内容)
  if (环境字段['CONFIG_ENCRYPTION'] !== 'false') {
    throw new Error(`凭据文件必须包含 CONFIG_ENCRYPTION=false: ${文件路径}`)
  }
  switch (目标配置.provider) {
    case 'aliyun-oss': {
      let 映射凭据 = {
        region: 环境字段[目标配置.env.region] ?? '',
        endpoint: 环境字段[目标配置.env.endpoint] ?? '',
        bucket: 环境字段[目标配置.env.bucket] ?? '',
        accessKeyId: 环境字段[目标配置.env.accessKeyId] ?? '',
        accessKeySecret: 环境字段[目标配置.env.accessKeySecret] ?? '',
      }
      return { targetName: 目标名称, provider: 'aliyun-oss', credentials: 纯OSS凭据Schema.parse(映射凭据) }
    }
    case 'tencent-cos': {
      let 映射凭据 = {
        region: 环境字段[目标配置.env.region] ?? '',
        bucket: 环境字段[目标配置.env.bucket] ?? '',
        secretId: 环境字段[目标配置.env.secretId] ?? '',
        secretKey: 环境字段[目标配置.env.secretKey] ?? '',
      }
      return { targetName: 目标名称, provider: 'tencent-cos', credentials: 纯COS凭据Schema.parse(映射凭据) }
    }
  }
}

export function 校验范围(配置: 外挂LFS配置, 范围?: string): string | undefined {
  if (范围 === undefined) return undefined
  if (配置.managedPaths.some((项) => 项.scope === 范围) === false) throw new Error(`未知 scope: ${范围}`)
  return 范围
}

export function 校验目标(配置: 外挂LFS配置, 目标?: string): string | undefined {
  if (目标 === undefined) return undefined
  if (配置.targets[目标] === undefined) {
    let 可选目标 = Object.keys(配置.targets).join(', ')
    throw new Error(`未知 target: ${目标}。当前配置的目标有: ${可选目标}`)
  }
  return 目标
}
