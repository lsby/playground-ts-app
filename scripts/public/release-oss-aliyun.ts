import OSS from 'ali-oss'
import crypto from 'crypto'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { 读取环境文件明文 } from '../setup/env-crypto-core.mjs'
import { 构建网站, 获取网站文件, 验证网站产物 } from './web-build'
import { 报告网站发布错误, 校验发布参数, 网站发布错误, 网站项目根目录, 获取平台配置, 读取网站配置 } from './web-config'

let 本地同步目录 = ''
let 配置校验器 = z
  .object({
    CONFIG_ENCRYPTION: z.literal('false'),
    OSS_REGION: z.string().min(1),
    OSS_ACCESS_KEY_ID: z.string().min(1),
    OSS_ACCESS_KEY_SECRET: z.string().min(1),
    OSS_BUCKET: z.string().min(1),
    OSS_PREFIX: z.string().regex(/^(?:[a-z0-9_-]+\/)*$/u),
    OSS_ROOT_ALLOWED_DIRECTORIES: z.string().regex(/^(?:[a-z0-9_-]+(?:,[a-z0-9_-]+)*)?$/u),
  })
  .strict()
type 上传任务 = { 本地绝对路径: string; 云端键: string }

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
  let 目标 = 获取平台配置('oss', 读取网站配置())
  本地同步目录 = 目标.产物目录
  let 参数 = 校验发布参数()
  if (目标.启用 === false) throw new 网站发布错误('OSS 网站发布未启用')
  if (参数.仅构建 === true) {
    await 构建网站(目标.公共路径, 本地同步目录)
    return
  }
  let 配置 = 配置校验器.parse(
    dotenv.parse(读取环境文件明文(网站项目根目录, path.join(网站项目根目录, '.env/.env.oss-aliyun'))),
  )
  let 云端目标目录 = 配置.OSS_PREFIX
  if (`/${云端目标目录}` !== 目标.公共路径) throw new 网站发布错误('OSS_PREFIX 与 OSS_PUBLIC_PATH 必须一致')
  if (云端目标目录 === '' && 参数.删除 === true) throw new 网站发布错误('Bucket 根站点禁止批量删除')
  if (参数.仅上传 === false) await 构建网站(目标.公共路径, 本地同步目录)
  验证网站产物(目标.公共路径, 本地同步目录)
  let 本地文件 = 获取网站文件(本地同步目录)
  let 允许目录 = new Set(配置.OSS_ROOT_ALLOWED_DIRECTORIES.split(',').filter((值): boolean => 值 !== ''))
  if (云端目标目录 === '') {
    for (let 文件 of 本地文件) {
      let 相对路径 = path.relative(本地同步目录, 文件).replaceAll('\\', '/')
      let 一级目录 = 相对路径.split('/')[0]
      if (相对路径.includes('/') === true && (一级目录 === undefined || 允许目录.has(一级目录) === false))
        throw new 网站发布错误('根站点产物包含未授权目录，请检查 OSS_ROOT_ALLOWED_DIRECTORIES')
    }
  }
  let 客户端 = new OSS({
    secure: true,
    authorizationV4: true,
    region: 配置.OSS_REGION,
    accessKeyId: 配置.OSS_ACCESS_KEY_ID,
    accessKeySecret: 配置.OSS_ACCESS_KEY_SECRET,
    bucket: 配置.OSS_BUCKET,
  })
  let 云端对象: OSS.ObjectMeta[] = []
  let 变更: { 上传: 上传任务[]; 删除: string[] }
  if (云端目标目录 === '') {
    let 上传: 上传任务[] = []
    for (let 文件 of 本地文件) {
      let 键 = path.relative(本地同步目录, 文件).replaceAll('\\', '/')
      try {
        let 结果 = await 客户端.head(键)
        let etag = z.object({ etag: z.string() }).parse(结果.res.headers).etag
        if (etag.replaceAll('"', '').toLowerCase() !== 计算MD5(文件)) 上传.push({ 本地绝对路径: 文件, 云端键: 键 })
      } catch (错误: unknown) {
        let 不存在 = z.object({ status: z.literal(404) }).safeParse(错误)
        if (不存在.success === false) throw new 网站发布错误('读取 OSS 根站点文件失败，请检查权限和网络')
        上传.push({ 本地绝对路径: 文件, 云端键: 键 })
      }
    }
    变更 = { 上传, 删除: [] }
  } else {
    云端对象 = await 获取云端对象(客户端, 云端目标目录)
    变更 = 计算变更(本地文件, 云端对象, 云端目标目录)
  }
  console.log(`待上传 ${变更.上传.length} 个文件，可清理 ${变更.删除.length} 个旧文件。`)
  for (let 项 of 变更.上传) console.log(`[待上传] ${项.云端键}`)
  for (let 键 of 变更.删除) console.log(`[旧文件] ${键}`)
  if (参数.确认 === false) {
    console.log('确认后添加 --yes 执行上传。')
    return
  }
  let 页面任务 = 变更.上传.filter((项): boolean => path.extname(项.本地绝对路径).toLowerCase() === '.html')
  let 资源任务 = 变更.上传.filter((项): boolean => path.extname(项.本地绝对路径).toLowerCase() !== '.html')
  await 执行上传(客户端, 资源任务)
  await 执行上传(客户端, 页面任务)
  if (参数.删除 === true) await 执行删除(客户端, 变更.删除)
  console.log('阿里云 OSS 同步完成。')
}

void 执行同步().catch(报告网站发布错误)
