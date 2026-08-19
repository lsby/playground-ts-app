import archiver from 'archiver'
import { execSync } from 'child_process'
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

function 获得App资源目录(便携包目录: string): string {
  if (process.platform === 'win32') {
    return path.join(便携包目录, 'app')
  }
  return path.join(便携包目录, 'lsby-playground-ts-service.app/Contents/Resources/app')
}

export async function 写入AppPackageJson(项目根目录: string, 便携包目录: string): Promise<void> {
  let 源包信息 = 包信息模式.parse(JSON.parse(await fs.promises.readFile(path.join(项目根目录, 'package.json'), 'utf8')))
  let app资源目录 = 获得App资源目录(便携包目录)
  let 便携包信息路径 = path.join(app资源目录, 'package.json')
  let Prisma迁移名称组 = 获得Prisma迁移名称组(path.join(app资源目录, 'prisma/migrations'))
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
}

export async function 生成Electron便携资源(项目根目录: string, 便携包目录: string, 发布目录: string): Promise<void> {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return
  if (process.arch !== 'x64' && process.arch !== 'arm64')
    throw new Error(`暂不支持生成 ${process.arch} Electron 便携包`)
  await 写入AppPackageJson(项目根目录, 便携包目录)
  let 源包信息 = 包信息模式.parse(JSON.parse(await fs.promises.readFile(path.join(项目根目录, 'package.json'), 'utf8')))
  let 项目名 = 源包信息.name.replace(/^@[^/]+\//, '')
  let 资源名称 = `${项目名}-electron-${源包信息.version}-${process.platform}-${process.arch}.zip`
  let 资源路径 = path.join(发布目录, 资源名称)

  if (process.platform === 'darwin') {
    // macOS 下优先使用 ditto 保留符号链接与文件权限
    if (fs.existsSync(资源路径) === true) {
      fs.rmSync(资源路径, { force: true })
    }
    execSync(`ditto -c -k --sequesterRsrc "${便携包目录}" "${资源路径}"`, { stdio: 'inherit' })
  } else {
    await 创建便携压缩包(便携包目录, 资源路径)
  }
  console.log(`✅ 已生成 Electron 完整便携包: ${资源路径}`)
}
