import archiver from 'archiver'
import * as fs from 'fs'
import * as path from 'path'
import { 日志类 } from './model'

export function 获取Git忽略名单(项目根目录: string): string[] {
  let 忽略文件路径 = path.join(项目根目录, '.gitignore')

  if (fs.existsSync(忽略文件路径) === false) {
    return []
  }

  let 内容 = fs.readFileSync(忽略文件路径, 'utf-8')
  return 内容
    .split(/\r?\n/)
    .map((行: string) => 行.trim())
    .filter((行: string) => 行.length > 0 && 行.startsWith('#') === false && 行.startsWith('!') === false)
    .flatMap((行: string) => {
      let 模式 = 行
      if (模式.startsWith('/') === true) {
        模式 = 模式.substring(1)
      }
      if (模式.endsWith('/**') === true || 模式.endsWith('**') === true) {
        return [模式]
      }
      if (模式.endsWith('/') === true) {
        return [模式, `${模式}**`]
      }
      return [模式, `${模式}/**`]
    })
}

export function 获取完整忽略名单(项目根目录: string): string[] {
  let 默认排除名单 = [
    '.git',
    '.git/**',
    'test',
    'test/**',
    'doc',
    'doc/**',
    '.agents',
    '.agents/**',
    '.github',
    '.github/**',
    '.vscode',
    '.vscode/**',
    '.idea',
    '.idea/**',
    'test-outputs',
    'test-outputs/**',
    // 手机端/移动端工程及配置
    'android',
    'android/**',
    'ios',
    'ios/**',
    'native',
    'native/**',
    'capacitor.config.ts',
    'capacitor.config.json',
  ]
  return Array.from(new Set([...获取Git忽略名单(项目根目录), ...默认排除名单]))
}

export type 压缩项目参数 = {
  输出路径: string
  源码目录: string
  忽略名单: string[]
  日志?: 日志类
  包含名单?: string[]
  强制包含文件组?: string[]
  覆盖文本文件组?: Array<{ 相对路径: string; 内容: string }>
}

export async function 压缩项目(参数: 压缩项目参数): Promise<void> {
  let { 输出路径, 源码目录, 忽略名单, 日志, 包含名单 = ['**/*'], 强制包含文件组 = [], 覆盖文本文件组 = [] } = 参数
  let 强制包含文件信息组 = 强制包含文件组.map((文件) => {
    let 绝对路径 = path.resolve(源码目录, 文件)
    let 相对路径 = path.relative(源码目录, 绝对路径)
    if (相对路径.startsWith('..') === true || path.isAbsolute(相对路径) === true) {
      throw new Error(`强制包含的打包文件必须位于项目内: ${文件}`)
    }
    if (fs.existsSync(绝对路径) === false || fs.statSync(绝对路径).isFile() === false) {
      throw new Error(`强制包含的打包文件不存在: ${文件}`)
    }
    return { 绝对路径, 相对路径: 相对路径.replace(/\\/g, '/') }
  })
  let 覆盖文本文件信息组 = 覆盖文本文件组.map((文件) => {
    let 绝对路径 = path.resolve(源码目录, 文件.相对路径)
    let 相对路径 = path.relative(源码目录, 绝对路径)
    if (相对路径 === '' || 相对路径.startsWith('..') === true || path.isAbsolute(相对路径) === true) {
      throw new Error(`覆盖的打包文件必须位于项目内: ${文件.相对路径}`)
    }
    return { ...文件, 内容: 文件.内容.replaceAll('\r\n', '\n'), 相对路径: 相对路径.replace(/\\/g, '/') }
  })

  return new Promise((resolve, reject) => {
    let 输出 = fs.createWriteStream(输出路径)
    输出.once('error', reject)
    let 归档器 = archiver('tar', { gzip: true, gzipOptions: { level: 9 } })
    let 已打包文件数 = 0
    let 目录统计 = new Map<string, { 文件数: number; 大小: number }>()

    if (日志 !== undefined) {
      归档器.on('entry', (数据) => {
        已打包文件数 += 1
        let 目录 = 数据.name.split('/')[0] ?? 数据.name
        let 统计 = 目录统计.get(目录) ?? { 文件数: 0, 大小: 0 }
        统计.文件数 += 1
        统计.大小 += 数据.stats?.size ?? 0
        目录统计.set(目录, 统计)
      })
    }

    输出.on('close', () => {
      if (日志 !== undefined) {
        for (let [目录, 统计] of 目录统计) {
          日志.打印(`📁 ${目录}: ${统计.文件数} 个文件，原始大小 ${(统计.大小 / 1024 / 1024).toFixed(2)} MB`)
        }
        日志.打印(`✅ 打包完成，共 ${已打包文件数} 个文件，最终大小: ${(归档器.pointer() / 1024 / 1024).toFixed(2)} MB`)
      }
      resolve()
    })

    归档器.on('error', (错误) => {
      reject(错误)
    })

    归档器.pipe(输出)

    // 确保不包含输出文件本身，防止循环打包导致 Size mismatch
    let 最终忽略名单 = [...忽略名单]
    let 相对输出路径 = path.relative(源码目录, 输出路径)
    if (相对输出路径.startsWith('..') === false && path.isAbsolute(相对输出路径) === false) {
      最终忽略名单.push(相对输出路径)
    }
    最终忽略名单.push(...覆盖文本文件信息组.map((文件) => 文件.相对路径))

    for (let 模式 of 包含名单) {
      归档器.glob(模式, { cwd: 源码目录, ignore: 最终忽略名单, dot: true, nodir: true })
    }
    for (let 文件 of 强制包含文件信息组) {
      归档器.file(文件.绝对路径, { name: 文件.相对路径 })
    }
    for (let 文件 of 覆盖文本文件信息组) {
      归档器.append(文件.内容, { name: 文件.相对路径 })
    }

    归档器.finalize().catch(reject)
  })
}
