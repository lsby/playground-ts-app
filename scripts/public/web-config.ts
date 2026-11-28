import dotenv from 'dotenv'
import path from 'path'
import { z } from 'zod'
import { 读取环境文件明文 } from '../setup/env-crypto-core.mjs'

export class 网站发布错误 extends Error {}

export let 网站项目根目录 = path.resolve(import.meta.dirname, '../../')
export let 公共路径模式 = z.string().regex(/^\/(?:[a-z0-9_-]+\/)*$/u)
let 开关模式 = z.enum(['true', 'false']).transform((值): boolean => 值 === 'true')
let 网站配置模式 = z
  .object({
    CONFIG_ENCRYPTION: z.literal('false'),
    ENABLE_OSS: 开关模式,
    ENABLE_GITHUB_PAGES: 开关模式,
    OSS_PUBLIC_PATH: 公共路径模式,
    PAGES_PUBLIC_PATH: 公共路径模式,
  })
  .strict()
export type 网站配置 = z.infer<typeof 网站配置模式>
export type 网站平台 = 'oss' | 'github-pages'

export function 读取发布选择(): 'all' | 网站平台 {
  let 输入 = process.env['INPUT_TARGET']
  if (输入 === undefined || 输入 === '') return 'all'
  return z.enum(['all', 'oss', 'github-pages']).parse(输入)
}

export function 读取网站配置(): 网站配置 {
  return 网站配置模式.parse(
    dotenv.parse(读取环境文件明文(网站项目根目录, path.join(网站项目根目录, '.env/.env.publish.web'))),
  )
}

export function 获取平台配置(平台: 网站平台, 配置: 网站配置): { 启用: boolean; 公共路径: string; 产物目录: string } {
  let 产物目录 = path.join(网站项目根目录, 'dist/web-publish', 平台)
  switch (平台) {
    case 'oss':
      return { 启用: 配置.ENABLE_OSS, 公共路径: 配置.OSS_PUBLIC_PATH, 产物目录 }
    case 'github-pages':
      return { 启用: 配置.ENABLE_GITHUB_PAGES, 公共路径: 配置.PAGES_PUBLIC_PATH, 产物目录 }
  }
}

export function 校验发布参数(): { 仅构建: boolean; 仅上传: boolean; 确认: boolean; 删除: boolean } {
  let 参数 = process.argv.slice(2).filter((值): boolean => 值 !== '--')
  if (参数.some((值): boolean => ['--build-only', '--upload-only', '--yes', '-y', '--delete'].includes(值) === false))
    throw new 网站发布错误('仅支持 --build-only、--upload-only、--yes、--delete')
  let 仅构建 = 参数.includes('--build-only')
  if (仅构建 === true && 参数.length !== 1) throw new 网站发布错误('--build-only 不能与其他参数合用')
  return {
    仅构建,
    仅上传: 参数.includes('--upload-only'),
    确认: 参数.includes('--yes') || 参数.includes('-y'),
    删除: 参数.includes('--delete'),
  }
}

export function 报告网站发布错误(错误: unknown): void {
  if (错误 instanceof z.ZodError)
    console.error('网站发布配置或产物格式错误:', 错误.issues.map((项): string => 项.path.join('.')).join(', '))
  else if (错误 instanceof 网站发布错误) console.error(错误.message)
  else console.error('网站发布失败，请检查配置、构建结果和网络。')
  process.exitCode = 1
}
