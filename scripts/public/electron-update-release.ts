import archiver from 'archiver'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'

let 仓库模式 = z.union([z.string(), z.object({ type: z.string().optional(), url: z.string() })]).optional()
let 包信息模式 = z.object({ name: z.string(), version: z.string(), repository: 仓库模式 })

export function 获得Prisma迁移名称组(迁移目录: string): string[] {
  if (fs.existsSync(迁移目录) === false) return []
  return fs
    .readdirSync(迁移目录, { withFileTypes: true })
    .filter((项目) => 项目.isDirectory())
    .map((项目) => 项目.name)
    .sort()
}

async function 创建便携压缩包(便携包目录: string, 输出路径: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let 输出 = fs.createWriteStream(输出路径, { flags: 'w' })
    let 压缩器 = archiver('zip', { zlib: { level: 6 } })
    输出.on('close', resolve)
    输出.on('error', reject)
    压缩器.on('error', reject)
    压缩器.pipe(输出)
    压缩器.directory(便携包目录, false)
    压缩器.finalize().catch(reject)
  })
}

export async function 生成Electron便携资源(项目根目录: string, 便携包目录: string, 发布目录: string): Promise<void> {
  if (process.platform !== 'win32') return
  if (process.arch !== 'x64' && process.arch !== 'arm64')
    throw new Error(`暂不支持生成 ${process.arch} Electron 便携包`)
  let 源包信息 = 包信息模式.parse(JSON.parse(await fs.promises.readFile(path.join(项目根目录, 'package.json'), 'utf8')))
  let 便携包信息路径 = path.join(便携包目录, 'app/package.json')
  let Prisma迁移名称组 = 获得Prisma迁移名称组(path.join(便携包目录, 'app/prisma/migrations'))
  let 首个Prisma迁移名称 = Prisma迁移名称组[0]
  await fs.promises.writeFile(
    便携包信息路径,
    JSON.stringify(
      {
        name: 源包信息.name,
        version: 源包信息.version,
        ...(首个Prisma迁移名称 === undefined ? {} : { prismaMigrationBaseline: 首个Prisma迁移名称 }),
        ...(源包信息.repository === undefined ? {} : { repository: 源包信息.repository }),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )
  let 项目名 = 源包信息.name.replace(/^@[^/]+\//, '')
  let 资源名称 = `${项目名}-electron-${源包信息.version}-win32-${process.arch}.zip`
  let 资源路径 = path.join(发布目录, 资源名称)
  await 创建便携压缩包(便携包目录, 资源路径)
  console.log(`✅ 已生成 Electron 完整便携包: ${资源路径}`)
}
