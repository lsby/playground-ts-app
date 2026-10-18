import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'

let 文本大小上限 = 10 * 1024 * 1024
let 允许直接入库的加密路径 = [/^\.env\/\.env\.external-lfs$/u, /^\.external-lfs\/manifests\/[a-f0-9-]+\.enc$/u]

type 可疑文件 = { path: string; reason: string }
function 外挂LFS已配置(): boolean {
  return fs.existsSync(path.resolve(import.meta.dirname, '../..', '.external-lfs/config.json'))
}

function 运行Git(参数: string[], 编码: BufferEncoding | null): string | Buffer {
  let 结果 = spawnSync('git', 参数, { encoding: 编码, maxBuffer: 32 * 1024 * 1024 })
  if (结果.status !== 0) {
    let 错误 = Buffer.isBuffer(结果.stderr) ? 结果.stderr.toString('utf8') : 结果.stderr
    throw new Error(`Git 命令失败: git ${参数.join(' ')}\n${错误}`)
  }
  return 结果.stdout
}

function 读取暂存路径(): string[] {
  let 输出 = 运行Git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], null)
  if (Buffer.isBuffer(输出) === false) throw new Error('无法读取暂存路径')
  return 输出
    .toString('utf8')
    .split('\0')
    .filter((值) => 值.length > 0)
}

function 是允许直接入库的加密文件(文件路径: string): boolean {
  return 允许直接入库的加密路径.some((规则) => 规则.test(文件路径))
}

function 读取暂存文件大小(文件路径: string): number {
  let 输出 = 运行Git(['cat-file', '-s', `:${文件路径}`], 'utf8')
  if (typeof 输出 !== 'string') throw new Error(`无法读取暂存文件大小: ${文件路径}`)
  let 大小 = Number.parseInt(输出.trim(), 10)
  if (Number.isSafeInteger(大小) === false || 大小 < 0) throw new Error(`暂存文件大小无效: ${文件路径}`)
  return 大小
}

function 读取暂存文件(文件路径: string): Buffer {
  let 输出 = 运行Git(['show', `:${文件路径}`], null)
  if (Buffer.isBuffer(输出) === false) throw new Error(`无法读取暂存文件: ${文件路径}`)
  return 输出
}

function 查找非法控制字节(内容: Buffer): number | undefined {
  for (let 字节 of 内容) {
    let 允许 = 字节 === 9 || 字节 === 10 || 字节 === 13 || 字节 >= 32
    if (允许 === false || 字节 === 127) return 字节
  }
  return undefined
}

function 判断可疑原因(文件路径: string): string | undefined {
  if (是允许直接入库的加密文件(文件路径) === true) return undefined
  let 大小 = 读取暂存文件大小(文件路径)
  if (大小 > 文本大小上限) return `文件大小 ${String(大小)} 字节，超过 10 MiB 文本上限`
  let 内容 = 读取暂存文件(文件路径)
  let 非法控制字节 = 查找非法控制字节(内容)
  if (非法控制字节 !== undefined) return `包含文本不允许的控制字节 0x${非法控制字节.toString(16).padStart(2, '0')}`
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(内容)
  } catch {
    return '内容不是合法 UTF-8 文本'
  }
  return undefined
}

function 输出可疑文件(可疑组: 可疑文件[], 已配置外挂LFS: boolean): void {
  console.error('检测到可能为二进制或不适合直接进入 Git 的文件：')
  for (let 文件 of 可疑组) console.error(`- ${文件.path}: ${文件.reason}`)
  if (已配置外挂LFS) console.error('本项目已配置外挂 LFS，通常应取消提交、扩展管辖规则并运行 external-lfs:push。')
  else console.error('请确认这些文件确实适合直接进入 Git；否则应取消提交并选择合适的外部存储方式。')
}

async function 二次确认(已配置外挂LFS: boolean): Promise<boolean> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    console.error('当前不是交互终端，拒绝例外提交。确有需要时设置 NUGGET_ALLOW_BINARY_GIT_COMMIT=true。')
    return false
  }
  let 读取器 = createInterface({ input: process.stdin, output: process.stdout })
  try {
    let 第一次 = (await 读取器.question('第一次确认：确定让这些文件直接进入 Git？输入 yes 继续：')).trim()
    if (第一次 !== 'yes') return false
    let 提示 = 已配置外挂LFS
      ? '第二次确认：这可能增大仓库且绕过外挂 LFS。输入 commit binary 继续：'
      : '第二次确认：这可能明显增大 Git 仓库。输入 commit binary 继续：'
    let 第二次 = (await 读取器.question(提示)).trim()
    return 第二次 === 'commit binary'
  } finally {
    读取器.close()
  }
}

async function 主函数(): Promise<void> {
  let 已配置外挂LFS = 外挂LFS已配置()
  let 可疑组: 可疑文件[] = []
  for (let 文件路径 of 读取暂存路径()) {
    let 原因 = 判断可疑原因(文件路径)
    if (原因 !== undefined) 可疑组.push({ path: 文件路径, reason: 原因 })
  }
  if (可疑组.length === 0) return
  输出可疑文件(可疑组, 已配置外挂LFS)
  if (process.env['NUGGET_ALLOW_BINARY_GIT_COMMIT'] === 'true') {
    console.error('已通过 NUGGET_ALLOW_BINARY_GIT_COMMIT=true 使用逃生舱，继续提交。')
    return
  }
  if (await 二次确认(已配置外挂LFS)) {
    console.error('两次确认均已通过，继续提交。')
    return
  }
  console.error('已取消提交。')
  process.exitCode = 1
}

await 主函数()
