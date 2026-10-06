import dotenv from 'dotenv'
import path from 'path'
import { z } from 'zod'
import { 读取环境文件明文 } from '../../scripts/setup/env-crypto-core.mjs'

function 解析项目根目录(): string {
  let 显式指定根目录 = process.env['PROJECT_ROOT_DIR']
  if (显式指定根目录 !== undefined && 显式指定根目录 !== '') return path.resolve(显式指定根目录)
  let 当前目录 = import.meta.dirname
  if (当前目录 === path.parse(当前目录).root) return path.dirname(process.execPath)
  if (当前目录.includes(path.join('dist', 'src', 'global')) === true) return path.resolve(当前目录, '../../..')
  return path.resolve(当前目录, '../..')
}

export function getRawEnv<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.infer<z.ZodObject<T>> {
  let 环境文件 = process.env['ENV_FILE_PATH']
  if (环境文件 === undefined || 环境文件 === '') throw new Error('缺少 ENV_FILE_PATH 环境变量')
  let 项目根目录 = 解析项目根目录()
  let 文件变量 = dotenv.parse(读取环境文件明文(项目根目录, 环境文件))
  return schema.parse({ ...文件变量, ...process.env })
}
