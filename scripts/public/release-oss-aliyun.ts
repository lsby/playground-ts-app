import OSS from 'ali-oss'
import crypto from 'crypto'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { 读取环境文件明文 } from '../setup/env-crypto-core.mjs'
import { Parcel基础参数, 纯前端生产环境文件 } from '../task/model/task-common'
import { 命令, 执行任务 } from '../task/model/task-runner'
import { 构建任务表 } from '../task/taskfile/taskfile-build'
import { 生成任务表 } from '../task/taskfile/taskfile-generate'
import { 质量任务表 } from '../task/taskfile/taskfile-quality'
import { 写入发布信息, 创建发布信息, 发布信息文件名, 发布信息模式 } from './release-info'

let 项目根目录 = path.resolve(import.meta.dirname, '../../')
let 本地同步目录 = path.join(项目根目录, 'dist/src/web')
let 配置文件路径 = path.join(项目根目录, '.env/.env.oss-aliyun')
let 目标目录校验器 = z
  .string()
  .min(1)
  .regex(/^\/?[\w/-]+\/?$/, '云端目标目录只能包含字母、数字、下划线、短横线和斜杠')
let 配置校验器 = z
  .object({
    CONFIG_ENCRYPTION: z.literal('false'),
    OSS_REGION: z.string().min(1),
    OSS_ACCESS_KEY_ID: z.string().min(1),
    OSS_ACCESS_KEY_SECRET: z.string().min(1),
    OSS_BUCKET: z.string().min(1),
    OSS_PREFIX: 目标目录校验器,
  })
  .strict()
let 网站构建信息文件名 = 'website-build.json'
let 网站构建信息模式 = z
  .object({
    schemaVersion: z.literal(1),
    publicPath: z.string().regex(/^\/[\w/-]+\/$/u),
    gitCommit: 发布信息模式.shape.gitCommit,
  })
  .strict()
type 配置类型 = z.infer<typeof 配置校验器>
type 上传任务 = { 本地绝对路径: string; 云端键: string }

class 发布错误 extends Error {}

function 读取配置(): 配置类型 {
  if (fs.existsSync(配置文件路径) === false) throw new 发布错误('缺少 .env/.env.oss-aliyun 配置文件')
  return 配置校验器.parse(dotenv.parse(读取环境文件明文(项目根目录, 配置文件路径)))
}

function 标准化目标目录(目录: string): string {
  let 结果 = 目录.replace(/^\/+|\/+$/g, '')
  if (结果 === '') throw new 发布错误('为避免误删整个 Bucket，云端目标目录不能是根目录')
  return `${结果}/`
}

async function 构建纯前端应用(云端目标目录: string): Promise<void> {
  let 公共路径 = `/${云端目标目录}`
  创建发布信息(项目根目录, 纯前端生产环境文件)
  console.log(`正在构建纯前端本地模式，公共路径为 ${公共路径}`)
  await 执行任务(
    {
      ...生成任务表,
      ...质量任务表,
      ...构建任务表,
      'bundle:web-no-scope-hoist': {
        ...构建任务表['bundle:web-no-scope-hoist'],
        运行: 命令(
          'parcel',
          ...Parcel基础参数,
          '--no-scope-hoist',
          '--dist-dir',
          'dist/src/web',
          '--public-url',
          公共路径,
        ),
      },
    },
    'build:web:pure-frontend',
    { 环境文件: 纯前端生产环境文件 },
  )
  if (fs.existsSync(本地同步目录) === false) throw new 发布错误(`构建产物不存在: ${本地同步目录}`)
  let 发布信息 = 创建发布信息(项目根目录, 纯前端生产环境文件)
  写入发布信息(本地同步目录, 发布信息)
  let 网站构建信息 = 网站构建信息模式.parse({ schemaVersion: 1, publicPath: 公共路径, gitCommit: 发布信息.gitCommit })
  fs.writeFileSync(path.join(本地同步目录, 网站构建信息文件名), `${JSON.stringify(网站构建信息, null, 2)}\n`, 'utf-8')
}

function 验证已有产物(云端目标目录: string): void {
  let 当前发布信息 = 创建发布信息(项目根目录, 纯前端生产环境文件)
  if (当前发布信息.gitDirty === true) throw new 发布错误('上传已有产物要求 Git 工作区和暂存区干净')
  if (fs.existsSync(path.join(本地同步目录, 'index.html')) === false) throw new 发布错误('缺少纯前端首页，请先构建')
  let 发布信息路径 = path.join(本地同步目录, 发布信息文件名)
  if (fs.existsSync(发布信息路径) === false) throw new 发布错误('缺少 release-info.json，请先构建')
  let 已有发布信息 = 发布信息模式.parse(JSON.parse(fs.readFileSync(发布信息路径, 'utf-8')))
  if (已有发布信息.gitDirty === true || 已有发布信息.gitCommit !== 当前发布信息.gitCommit)
    throw new 发布错误('已有产物与当前干净的 Git 提交不一致，请重新构建')
  let 网站构建信息路径 = path.join(本地同步目录, 网站构建信息文件名)
  if (fs.existsSync(网站构建信息路径) === false) throw new 发布错误('缺少 website-build.json，请重新构建')
  let 网站构建信息 = 网站构建信息模式.parse(JSON.parse(fs.readFileSync(网站构建信息路径, 'utf-8')))
  if (网站构建信息.gitCommit !== 当前发布信息.gitCommit || 网站构建信息.publicPath !== `/${云端目标目录}`)
    throw new 发布错误('已有产物的构建提交或公共路径与本次上传目标不一致，请重新构建')
}

function 获取MIME类型(文件路径: string): string {
  let 映射: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.webm': 'video/webm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }
  return 映射[path.extname(文件路径).toLowerCase()] ?? 'application/octet-stream'
}

function 递归获取文件(目录: string): string[] {
  let 结果: string[] = []
  for (let 项 of fs.readdirSync(目录, { withFileTypes: true })) {
    let 绝对路径 = path.join(目录, 项.name)
    if (项.isDirectory() === true) 结果.push(...递归获取文件(绝对路径))
    else if (项.isFile() === true) 结果.push(绝对路径)
  }
  return 结果
}

function 计算MD5(文件路径: string): string {
  return crypto.createHash('md5').update(fs.readFileSync(文件路径)).digest('hex').toLowerCase()
}

async function 获取云端对象(客户端: OSS, 前缀: string): Promise<OSS.ObjectMeta[]> {
  let 对象列表: OSS.ObjectMeta[] = []
  let 下一页标记: string | undefined = undefined
  let 继续获取 = true
  while (继续获取 === true) {
    let 参数: OSS.ListV2ObjectsQuery = { prefix: 前缀, 'max-keys': 1000 }
    if (下一页标记 !== undefined) 参数['continuation-token'] = 下一页标记
    let 结果 = await 客户端.listV2(参数, {})
    对象列表.push(...结果.objects)
    继续获取 = 结果.isTruncated === true
    下一页标记 = 结果.nextContinuationToken
  }
  return 对象列表
}

function 计算变更(
  本地文件: string[],
  云端对象: OSS.ObjectMeta[],
  云端目标目录: string,
): { 上传: 上传任务[]; 删除: string[] } {
  let 云端映射 = new Map<string, OSS.ObjectMeta>()
  for (let 对象 of 云端对象) 云端映射.set(对象.name, 对象)
  let 本次文件键 = new Set<string>()
  let 上传: 上传任务[] = []
  for (let 本地绝对路径 of 本地文件) {
    let 相对路径 = path.relative(本地同步目录, 本地绝对路径).replace(/\\/g, '/')
    let 云端键 = `${云端目标目录}${相对路径}`
    本次文件键.add(云端键)
    let 已有对象 = 云端映射.get(云端键)
    if (已有对象 === undefined || 已有对象.etag.replaceAll('"', '').toLowerCase() !== 计算MD5(本地绝对路径)) {
      上传.push({ 本地绝对路径, 云端键 })
    }
  }
  let 删除 = 云端对象
    .filter((对象) => 对象.name.endsWith('/') === false && 本次文件键.has(对象.name) === false)
    .map((对象) => 对象.name)
  return { 上传, 删除 }
}

function 已确认同步(): boolean {
  return process.argv.includes('--yes') === true || process.argv.includes('-y') === true
}

async function 执行上传(客户端: OSS, 任务列表: 上传任务[]): Promise<void> {
  let 当前索引 = 0
  let 运行任务 = async (): Promise<void> => {
    while (当前索引 < 任务列表.length) {
      let 任务 = 任务列表[当前索引]
      当前索引 = 当前索引 + 1
      if (任务 === undefined) continue
      let 是否包含内容哈希 = /\.[a-f0-9]{8}\./u.test(path.basename(任务.本地绝对路径))
      console.log(`[上传] ${任务.云端键}`)
      await 客户端.put(任务.云端键, 任务.本地绝对路径, {
        headers: {
          'cache-control': 是否包含内容哈希 === true ? 'public, max-age=31536000, immutable' : 'no-cache',
          'content-type': 获取MIME类型(任务.本地绝对路径),
        },
      })
    }
  }
  let 并发任务: Promise<void>[] = []
  for (let 索引 = 0; 索引 < Math.min(5, 任务列表.length); 索引 = 索引 + 1) 并发任务.push(运行任务())
  await Promise.all(并发任务)
}

async function 执行删除(客户端: OSS, 删除列表: string[]): Promise<void> {
  for (let 起点 = 0; 起点 < 删除列表.length; 起点 = 起点 + 1000) {
    let 当前批次 = 删除列表.slice(起点, 起点 + 1000)
    console.log(`[删除] ${当前批次.length} 个云端文件`)
    await 客户端.deleteMulti(当前批次, { quiet: true })
  }
}

async function 执行同步(): Promise<void> {
  let 参数列表 = process.argv.slice(2).filter((参数) => 参数 !== '--')
  for (let 参数 of 参数列表) {
    if (
      ['--yes', '-y', '--delete', '--upload-only'].includes(参数) === false &&
      参数.startsWith('--build-only=') === false
    )
      throw new 发布错误('未知发布参数；支持 --build-only=<目录>、--upload-only、--yes、--delete')
  }
  let 仅构建参数列表 = 参数列表.filter((参数) => 参数.startsWith('--build-only='))
  if (仅构建参数列表.length > 1) throw new 发布错误('--build-only 只能指定一次')
  let 仅构建参数 = 仅构建参数列表[0]
  if (仅构建参数 !== undefined) {
    if (参数列表.length !== 1) throw new 发布错误('--build-only 不能与上传或删除参数同时使用')
    let 云端目标目录 = 标准化目标目录(目标目录校验器.parse(仅构建参数.slice('--build-only='.length)))
    await 构建纯前端应用(云端目标目录)
    console.log('纯前端 OSS 子目录构建完成。')
    return
  }
  let 配置 = 读取配置()
  let 云端目标目录 = 标准化目标目录(配置.OSS_PREFIX)
  if (参数列表.includes('--upload-only') === false) await 构建纯前端应用(云端目标目录)
  验证已有产物(云端目标目录)
  let 客户端 = new OSS({
    region: 配置.OSS_REGION,
    accessKeyId: 配置.OSS_ACCESS_KEY_ID,
    accessKeySecret: 配置.OSS_ACCESS_KEY_SECRET,
    bucket: 配置.OSS_BUCKET,
  })
  let 本地文件 = 递归获取文件(本地同步目录)
  let 云端对象 = await 获取云端对象(客户端, 云端目标目录)
  let 变更 = 计算变更(本地文件, 云端对象, 云端目标目录)
  console.log(`本地 ${本地文件.length} 个文件，待上传 ${变更.上传.length} 个，可清理旧文件 ${变更.删除.length} 个。`)
  if (变更.上传.length === 0 && 变更.删除.length === 0) {
    console.log('云端已经是最新状态。')
    return
  }
  for (let 上传 of 变更.上传) console.log(`[待上传] ${上传.云端键}`)
  for (let 云端键 of 变更.删除) console.log(`[旧文件] ${云端键}`)
  if (已确认同步() === false) {
    console.log('未执行云端变更。确认列表后请添加 --yes 或 -y 参数重新运行。')
    return
  }
  let 页面任务 = 变更.上传.filter((任务) => path.extname(任务.本地绝对路径).toLowerCase() === '.html')
  let 资源任务 = 变更.上传.filter((任务) => path.extname(任务.本地绝对路径).toLowerCase() !== '.html')
  await 执行上传(客户端, 资源任务)
  await 执行上传(客户端, 页面任务)
  if (process.argv.includes('--delete') === true) await 执行删除(客户端, 变更.删除)
  else if (变更.删除.length > 0) console.log('已保留云端旧文件；确认删除时请同时添加 --yes --delete。')
  console.log('阿里云 OSS 同步完成。')
}

void 执行同步().catch((错误: unknown): void => {
  if (错误 instanceof 发布错误) console.error('阿里云 OSS 同步失败:', 错误.message)
  else if (错误 instanceof z.ZodError) {
    let 校验错误文案: Partial<Record<z.ZodIssueCode, string>> = {
      invalid_type: '缺少必填字段或类型错误',
      too_small: '内容不能为空或短于允许长度',
      invalid_string: '格式错误',
      invalid_literal: '固定值错误',
      unrecognized_keys: '包含未声明字段',
    }
    console.error('发布配置或产物校验失败：')
    for (let 问题 of 错误.issues) console.error(`${问题.path.join('.')}: ${校验错误文案[问题.code] ?? '校验失败'}`)
  } else {
    let 错误摘要 = z
      .object({
        code: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,64}$/u)
          .optional(),
        status: z.number().int().optional(),
      })
      .safeParse(错误)
    console.error('阿里云 OSS 同步失败，请检查构建输出、配置和网络。', 错误摘要.success === true ? 错误摘要.data : '')
  }
  process.exitCode = 1
})
