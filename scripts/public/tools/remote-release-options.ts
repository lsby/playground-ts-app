import { z } from 'zod'

export let Docker发布模式 = z.enum([
  'build',
  'run',
  'upload',
  'run-uploaded',
  'logs',
  'restart',
  'redeploy',
  'stop',
  'delete',
  'sync-to-local',
  'sync-to-server',
])
export let Docker发布环境 = z.enum(['development', 'production'])
export let 压缩包哈希模式 = z.string().regex(/^[a-f0-9]{64}$/u)
export type Docker发布选项 = {
  服务器名称: string
  模式: z.infer<typeof Docker发布模式>
  环境: z.infer<typeof Docker发布环境> | undefined
  使用缓存: boolean
  复用本地构建: boolean
  跟随日志: boolean
  压缩包哈希: string | undefined
}

export function 需要Docker发布确认(模式: Docker发布选项['模式']): boolean {
  return ['run', 'run-uploaded', 'redeploy', 'delete', 'sync-to-server'].includes(模式)
}

export function 解析Docker发布参数(参数组: string[]): Docker发布选项 {
  let 值参数 = new Map<string, string>()
  let 标志组 = new Set<string>()
  for (let 参数 of 参数组) {
    let 匹配 = /^--(server|mode|environment|package-sha256)=(.+)$/u.exec(参数)
    if (匹配 !== null) {
      let 名称 = z.string().parse(匹配[1])
      if (值参数.has(名称) === true) throw new Error(`重复参数: --${名称}`)
      值参数.set(名称, z.string().parse(匹配[2]))
      continue
    }
    if (
      [
        '--non-interactive',
        '--yes',
        '--no-cache',
        '--no-reuse-local-build',
        '--follow-logs',
        '--no-follow-logs',
      ].includes(参数) === false
    )
      throw new Error(`未知 Docker 发布参数: ${参数}`)
    if (标志组.has(参数) === true) throw new Error(`重复参数: ${参数}`)
    标志组.add(参数)
  }
  if (标志组.has('--non-interactive') === false) throw new Error('命令行发布必须显式提供 --non-interactive')
  let 服务器名称 = z.string().min(1).parse(值参数.get('server'))
  let 模式 = Docker发布模式.parse(值参数.get('mode'))
  let 环境 = 模式 === 'delete' ? undefined : Docker发布环境.parse(值参数.get('environment'))
  if (模式 === 'delete' && 值参数.has('environment') === true)
    throw new Error('delete 会删除整个项目，请勿指定单个环境')
  if (需要Docker发布确认(模式) === true && 标志组.has('--yes') === false)
    throw new Error(`${模式} 会修改远程服务或数据，必须显式提供 --yes`)
  if (标志组.has('--follow-logs') === true && 标志组.has('--no-follow-logs') === true)
    throw new Error('--follow-logs 与 --no-follow-logs 不能同时使用')
  if (标志组.has('--no-cache') === true && ['build', 'run', 'run-uploaded', 'redeploy'].includes(模式) === false)
    throw new Error('--no-cache 仅用于构建或部署镜像')
  if (标志组.has('--no-reuse-local-build') === true && ['build', 'run', 'redeploy', 'upload'].includes(模式) === false)
    throw new Error('--no-reuse-local-build 仅用于打包；run-uploaded 的构建方式由上传说明决定')
  if (
    (标志组.has('--follow-logs') === true || 标志组.has('--no-follow-logs') === true) &&
    ['run', 'run-uploaded', 'restart', 'redeploy', 'logs'].includes(模式) === false
  )
    throw new Error('当前模式不支持跟随日志选项')
  if (模式 === 'logs' && 标志组.has('--no-follow-logs') === true) throw new Error('logs 模式始终跟随日志')
  let 压缩包哈希 = 模式 === 'run-uploaded' ? 压缩包哈希模式.parse(值参数.get('package-sha256')) : undefined
  if (模式 !== 'run-uploaded' && 值参数.has('package-sha256') === true)
    throw new Error('--package-sha256 仅用于 run-uploaded')
  return {
    服务器名称,
    模式,
    环境,
    压缩包哈希,
    使用缓存: 标志组.has('--no-cache') === false,
    复用本地构建: 标志组.has('--no-reuse-local-build') === false,
    跟随日志: 模式 === 'logs' || 标志组.has('--follow-logs') === true,
  }
}

export function 序列化Docker发布参数(选项: Docker发布选项): string[] {
  let 参数组 = ['--non-interactive', `--server=${选项.服务器名称}`, `--mode=${选项.模式}`]
  if (选项.环境 !== undefined) 参数组.push(`--environment=${选项.环境}`)
  if (需要Docker发布确认(选项.模式) === true) 参数组.push('--yes')
  if (选项.使用缓存 === false) 参数组.push('--no-cache')
  if (选项.复用本地构建 === false) 参数组.push('--no-reuse-local-build')
  if (选项.跟随日志 === true) 参数组.push('--follow-logs')
  if (选项.压缩包哈希 !== undefined) 参数组.push(`--package-sha256=${选项.压缩包哈希}`)
  return 参数组
}
