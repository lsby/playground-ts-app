import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { 项目根目录 } from './config'
import { 加密文件, 解密文件 } from './crypto'
import { 清单Schema, type 外挂LFS配置, type 本地文件, type 清单 } from './model'

function 规范路径(值: string): string {
  return 值.replaceAll('\\', '/')
}

function 是否排除(相对路径: string, 配置: 外挂LFS配置): boolean {
  return 配置.exclude.some((模式) => path.matchesGlob(相对路径, 模式))
}

async function 计算摘要(文件路径: string): Promise<{ size: number; sha256: string }> {
  let 哈希器 = crypto.createHash('sha256')
  await pipeline(fs.createReadStream(文件路径), 哈希器)
  return { size: fs.statSync(文件路径).size, sha256: 哈希器.digest('hex') }
}

async function 扫描目录(目录: string, scope: string, 配置: 外挂LFS配置, 结果: 本地文件[]): Promise<void> {
  for (let 项 of fs.readdirSync(目录, { withFileTypes: true })) {
    let 绝对路径 = path.join(目录, 项.name)
    let 相对路径 = 规范路径(path.relative(项目根目录, 绝对路径))
    if (是否排除(相对路径, 配置) === true) continue
    if (项.isSymbolicLink() === true) throw new Error(`第一版不支持符号链接: ${相对路径}`)
    if (项.isDirectory() === true) {
      await 扫描目录(绝对路径, scope, 配置, 结果)
      continue
    }
    if (项.isFile() === false) throw new Error(`不支持的文件类型: ${相对路径}`)
    let 摘要 = await 计算摘要(绝对路径)
    结果.push({ path: 相对路径, scope, absolutePath: 绝对路径, ...摘要 })
  }
}

export async function 扫描本地文件(配置: 外挂LFS配置, scope?: string): Promise<Map<string, 本地文件>> {
  let 结果: 本地文件[] = []
  for (let 管辖项 of 配置.managedPaths) {
    if (scope !== undefined && 管辖项.scope !== scope) continue
    let 目录 = path.resolve(项目根目录, 管辖项.path)
    if (fs.existsSync(目录) === false) continue
    if (fs.statSync(目录).isDirectory() === false) throw new Error(`管辖路径必须是目录: ${管辖项.path}`)
    await 扫描目录(目录, 管辖项.scope, 配置, 结果)
  }
  let 映射 = new Map<string, 本地文件>()
  for (let 文件 of 结果.sort((左, 右) => 左.path.localeCompare(右.path))) {
    if (映射.has(文件.path) === true) throw new Error(`多个管辖路径重复包含同一文件: ${文件.path}`)
    映射.set(文件.path, 文件)
  }
  return 映射
}

function 临时目录(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nugget-external-lfs-'))
}

export async function 读取清单组(配置: 外挂LFS配置): Promise<Map<string, 清单>> {
  let 目录 = path.resolve(项目根目录, 配置.manifestDirectory)
  if (fs.existsSync(目录) === false) return new Map()
  let 结果 = new Map<string, 清单>()
  for (let 名称 of fs
    .readdirSync(目录)
    .filter((值) => 值.endsWith('.enc'))
    .sort()) {
    let 标识 = 名称.slice(0, -4)
    let 临时根 = 临时目录()
    let 明文路径 = path.join(临时根, 'manifest.json')
    try {
      await 解密文件(path.join(目录, 名称), 明文路径, 'manifest', 标识)
      let 清单 = 清单Schema.parse(JSON.parse(fs.readFileSync(明文路径, 'utf8')))
      if (清单.id !== 标识) throw new Error(`清单文件名与 id 不一致: ${名称}`)
      let 管辖项 = 配置.managedPaths.find((项) => 项.scope === 清单.scope)
      if (管辖项 === undefined || 清单.path.startsWith(`${管辖项.path}/`) === false) {
        throw new Error(`清单路径不属于声明的 scope: ${清单.path}`)
      }
      if (清单.remote.objectKey.startsWith(`${配置.remotePrefix}/objects/`) === false) {
        throw new Error(`清单对象不属于声明的云端前缀: ${清单.path}`)
      }
      if (清单.remote.provider !== 配置.provider) {
        throw new Error(`清单 provider 与当前配置不一致: ${清单.path}`)
      }
      if (结果.has(清单.path) === true) throw new Error(`存在重复清单路径: ${清单.path}`)
      结果.set(清单.path, 清单)
    } finally {
      fs.rmSync(临时根, { recursive: true, force: true })
    }
  }
  return 结果
}

export async function 写入清单(配置: 外挂LFS配置, 清单: 清单): Promise<void> {
  let 目录 = path.resolve(项目根目录, 配置.manifestDirectory)
  fs.mkdirSync(目录, { recursive: true })
  let 临时根 = 临时目录()
  let 明文路径 = path.join(临时根, 'manifest.json')
  let 密文路径 = path.join(临时根, 'manifest.enc')
  try {
    fs.writeFileSync(明文路径, `${JSON.stringify(清单, null, 2)}\n`, { flag: 'wx' })
    await 加密文件(明文路径, 密文路径, 'manifest', 清单.id)
    let 目标 = path.join(目录, `${清单.id}.enc`)
    let 同目录临时文件 = `${目标}.${process.pid.toString()}.${crypto.randomUUID()}.tmp`
    let 备份 = `${同目录临时文件}.backup`
    fs.copyFileSync(密文路径, 同目录临时文件, fs.constants.COPYFILE_EXCL)
    if (fs.existsSync(目标) === true) fs.renameSync(目标, 备份)
    try {
      fs.renameSync(同目录临时文件, 目标)
      fs.rmSync(备份, { force: true })
    } catch (错误) {
      if (fs.existsSync(备份) === true) fs.renameSync(备份, 目标)
      throw 错误
    }
  } finally {
    fs.rmSync(临时根, { recursive: true, force: true })
  }
}

export function 删除清单(配置: 外挂LFS配置, 清单: 清单): void {
  fs.rmSync(path.resolve(项目根目录, 配置.manifestDirectory, `${清单.id}.enc`))
}

export function 创建临时目录(): string {
  return 临时目录()
}

export function 计算文件摘要(文件路径: string): Promise<{ size: number; sha256: string }> {
  return 计算摘要(文件路径)
}
