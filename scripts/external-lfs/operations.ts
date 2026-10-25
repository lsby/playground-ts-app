import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { 元数据匹配 } from './cloud-store'
import { 项目根目录 } from './config'
import { 加密文件, 解密文件 } from './crypto'
import {
  写入清单,
  创建临时目录,
  删除清单,
  扫描本地文件,
  文件匹配模式,
  规范路径,
  计算文件摘要,
  读取清单组,
} from './local-store'
import type { 外挂LFS配置, 本地文件, 清单 } from './model'
import { 云存储仓库管理器 } from './repository'

type 操作上下文 = {
  配置: 外挂LFS配置
  scope?: string | undefined
  仓库管理器: 云存储仓库管理器
  清单组: Map<string, 清单>
  本地组: Map<string, 本地文件>
}

async function 创建上下文(配置: 外挂LFS配置, scope?: string | undefined): Promise<操作上下文> {
  let 清单组 = await 读取清单组(配置)
  let 本地组 = await 扫描本地文件(配置, scope)
  return { 配置, scope, 仓库管理器: new 云存储仓库管理器(配置), 清单组, 本地组 }
}

function 选中清单(上下文: 操作上下文, 过滤?: { target?: string | undefined; file?: string | undefined }): 清单[] {
  return [...上下文.清单组.values()]
    .filter((项) => 上下文.scope === undefined || 项.scope === 上下文.scope)
    .filter((项) => 过滤?.target === undefined || 项.remote.target === 过滤.target)
    .filter((项) => 过滤?.file === undefined || 文件匹配模式(项.path, 过滤.file))
    .sort((左, 右) => 左.path.localeCompare(右.path))
}

function 文件相同(文件: 本地文件, 清单: 清单): boolean {
  return 文件.size === 清单.plaintext.size && 文件.sha256 === 清单.plaintext.sha256
}

function 格式化文件大小(字节数: number): string {
  if (字节数 < 1024) return `${String(字节数)} B`
  if (字节数 < 1024 * 1024) return `${(字节数 / 1024).toFixed(1)} KB`
  if (字节数 < 1024 * 1024 * 1024) return `${(字节数 / (1024 * 1024)).toFixed(1)} MB`
  return `${(字节数 / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

async function 请求确认(提示: string): Promise<boolean> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new Error('当前不是交互终端，请传入 --yes 跳过确认')
  }
  let 读取器 = createInterface({ input: process.stdin, output: process.stdout })
  try {
    let 回答 = (await 读取器.question(`${提示} (y/N): `)).trim().toLowerCase()
    return 回答 === 'y' || 回答 === 'yes'
  } finally {
    读取器.close()
  }
}

async function 上传一个(上下文: 操作上下文, 文件: 本地文件, 目标名称: string, 旧清单?: 清单): Promise<void> {
  let 目标配置 = 上下文.配置.targets[目标名称]
  if (目标配置 === undefined) throw new Error(`未声明的存储目标: ${目标名称}`)
  if (文件.size > 5 * 1024 * 1024 * 1024) throw new Error(`单文件上限为 5 GiB: ${文件.path}`)
  let id = 旧清单?.id ?? crypto.randomUUID()
  let objectKey = `${目标配置.remotePrefix}/objects/${crypto.randomUUID()}.bin`
  let 临时根 = 创建临时目录()
  let 密文路径 = path.join(临时根, 'object.enc')
  try {
    await 加密文件(文件.absolutePath, 密文路径, 'object', id)
    if (fs.statSync(密文路径).size > 5 * 1024 * 1024 * 1024) {
      throw new Error(`加密后单文件上限为 5 GiB: ${文件.path}`)
    }
    let 仓库 = 上下文.仓库管理器.获取仓库(目标名称)
    let 元数据 = await 仓库.上传(objectKey, 密文路径)
    let 清单: 清单 = {
      version: 1,
      id,
      path: 文件.path,
      scope: 文件.scope,
      plaintext: { size: 文件.size, sha256: 文件.sha256 },
      remote: { target: 目标名称, provider: 目标配置.provider, objectKey, ...元数据 },
      updatedAt: new Date().toISOString(),
    }
    await 写入清单(上下文.配置, 清单)
    console.log(`[已上传] ${文件.path} -> [${目标名称}] (${目标配置.provider})`)
  } finally {
    fs.rmSync(临时根, { recursive: true, force: true })
  }
}

type 待上传项 = { 文件: 本地文件; 目标名称: string; 类型: '新文件' | '更新'; 旧清单?: 清单 }

export type 推选项 = {
  scope?: string | undefined
  target?: string | undefined
  file?: string | undefined
  acceptDeletions: boolean
  yes: boolean
}

export async function 推送(配置: 外挂LFS配置, 选项: 推选项): Promise<void> {
  let 上下文 = await 创建上下文(配置, 选项.scope)
  let 本地候选 = [...上下文.本地组.values()]
  if (选项.file !== undefined) {
    let 模式 = 选项.file
    本地候选 = 本地候选.filter((文件) => 文件匹配模式(文件.path, 模式))
  }

  let 候选清单项 = 选中清单(上下文, { target: 选项.target, file: 选项.file })
  let 缺失 = 候选清单项.filter((项) => 上下文.本地组.has(项.path) === false)
  if (缺失.length > 0 && 选项.acceptDeletions === false) {
    throw new Error(`本地缺少 ${String(缺失.length)} 个已登记文件；确认删除时重新运行并传入 --accept-deletions`)
  }

  if (选项.file !== undefined && 本地候选.length === 0 && 缺失.length === 0) {
    throw new Error(`未匹配到任何管辖文件或清单: ${选项.file}`)
  }

  let 全部目标 = Object.keys(配置.targets)
  let 首个目标 = 全部目标[0]
  let 待上传组: 待上传项[] = []

  for (let 文件 of 本地候选) {
    let 旧清单 = 上下文.清单组.get(文件.path)
    if (旧清单 !== undefined) {
      if (选项.target !== undefined && 旧清单.remote.target !== 选项.target) {
        if (选项.file !== undefined && 本地候选.length === 1 && 本地候选[0]?.path === 规范路径(选项.file)) {
          throw new Error(
            `文件 ${文件.path} 已登记在目标 ${旧清单.remote.target}，与指定的 --target ${选项.target} 不一致`,
          )
        }
        continue
      }
      if (文件相同(文件, 旧清单) === true) continue
      待上传组.push({ 文件, 目标名称: 旧清单.remote.target, 类型: '更新', 旧清单 })
    } else {
      let 目标名称: string
      if (选项.target !== undefined) {
        目标名称 = 选项.target
      } else if (全部目标.length === 1 && 首个目标 !== undefined) {
        目标名称 = 首个目标
      } else {
        throw new Error(
          `文件 ${文件.path} 为未登记的新文件，配置了多个存储目标 (${全部目标.join(', ')}) 时，必须显式指定 --target <目标名称>`,
        )
      }
      待上传组.push({ 文件, 目标名称, 类型: '新文件' })
    }
  }

  if (待上传组.length === 0 && 缺失.length === 0) {
    console.log('所有匹配文件均已最新，无需推送。')
    return
  }

  console.log('=== 即将推送以下变更 ===')
  for (let 项 of 待上传组) {
    console.log(`  [${项.类型}] -> [${项.目标名称}] ${项.文件.path} (${格式化文件大小(项.文件.size)})`)
  }
  for (let 项 of 缺失) {
    console.log(`  [取消登记] ${项.path}（远端历史保留）`)
  }
  console.log(`共计：上传 ${String(待上传组.length)} 个，取消登记 ${String(缺失.length)} 个。`)

  if (选项.yes !== true) {
    let 确认 = await 请求确认('确认继续推送以上文件吗？')
    if (确认 !== true) {
      console.log('已取消推送。')
      return
    }
  }

  for (let 项 of 待上传组) {
    await 上传一个(上下文, 项.文件, 项.目标名称, 项.旧清单)
  }

  for (let 清单 of 缺失) {
    删除清单(配置, 清单)
    console.log(`[取消登记] ${清单.path}（远端历史对象保留）`)
  }
  console.log(`推送完成：上传 ${String(待上传组.length)}，取消登记 ${String(缺失.length)}。请提交加密清单。`)
}

function 恢复目录(): string {
  let 时间 = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  return path.resolve(项目根目录, '.external-lfs/recovery', 时间)
}

function 移入恢复区(文件路径: string, 相对路径: string, 根目录: string): void {
  let 目标 = path.join(根目录, ...相对路径.split('/'))
  fs.mkdirSync(path.dirname(目标), { recursive: true })
  fs.renameSync(文件路径, 目标)
  console.log(`[保留本地版本] ${相对路径} -> ${path.relative(项目根目录, 目标)}`)
}

async function 下载一个(上下文: 操作上下文, 清单: 清单, 恢复根?: string): Promise<void> {
  let 目标 = path.resolve(项目根目录, ...清单.path.split('/'))
  if (fs.existsSync(目标) === true) {
    if (恢复根 === undefined) throw new Error(`拒绝覆盖本地文件: ${清单.path}`)
    移入恢复区(目标, 清单.path, 恢复根)
  }
  let 临时根 = 创建临时目录()
  let 密文路径 = path.join(临时根, 'object.enc')
  let 明文路径 = path.join(临时根, 'plain')
  try {
    let 仓库 = 上下文.仓库管理器.获取仓库(清单.remote.target)
    let 元数据 = await 仓库.下载(清单, 密文路径)
    if (元数据匹配(清单, 元数据) === false) throw new Error(`远端对象元数据与清单不一致: ${清单.path}`)
    await 解密文件(密文路径, 明文路径, 'object', 清单.id)
    let 摘要 = await 计算文件摘要(明文路径)
    if (摘要.size !== 清单.plaintext.size || 摘要.sha256 !== 清单.plaintext.sha256) {
      throw new Error(`下载内容哈希与清单不一致: ${清单.path}`)
    }
    fs.mkdirSync(path.dirname(目标), { recursive: true })
    fs.renameSync(明文路径, 目标)
    console.log(`[下载] ${清单.path} (来源: ${清单.remote.target})`)
  } finally {
    fs.rmSync(临时根, { recursive: true, force: true })
  }
}

export type 拉选项 = {
  scope?: string | undefined
  target?: string | undefined
  file?: string | undefined
  exact: boolean
}

export async function 拉取(配置: 外挂LFS配置, 选项: 拉选项): Promise<void> {
  let 上下文 = await 创建上下文(配置, 选项.scope)
  let 候选清单 = 选中清单(上下文, { target: 选项.target, file: 选项.file })
  if (选项.file !== undefined && 候选清单.length === 0) {
    throw new Error(`清单中未找到匹配的文件: ${选项.file}`)
  }

  let 恢复根 = 选项.exact === true ? 恢复目录() : undefined
  let 下载数 = 0
  for (let 清单 of 候选清单) {
    let 文件 = 上下文.本地组.get(清单.path)
    if (文件 !== undefined && 文件相同(文件, 清单) === true) continue
    await 下载一个(上下文, 清单, 恢复根)
    下载数 += 1
  }
  let 多余文件 = [...上下文.本地组.values()].filter((项) => 上下文.清单组.has(项.path) === false)
  if (选项.exact === true && 恢复根 !== undefined) {
    for (let 文件 of 多余文件) 移入恢复区(文件.absolutePath, 文件.path, 恢复根)
  }
  console.log(`拉取完成：下载 ${String(下载数)}，本地额外文件 ${String(多余文件.length)}。`)
}

export type 列表选项 = { scope?: string | undefined; target?: string | undefined; file?: string | undefined }

export async function 列表(配置: 外挂LFS配置, 选项: 列表选项): Promise<void> {
  let 上下文 = await 创建上下文(配置, 选项.scope)
  let 候选清单 = 选中清单(上下文, { target: 选项.target, file: 选项.file })
  console.log('=== 外挂 LFS 文件清单 ===')
  for (let 清单 of 候选清单) {
    let 本地 = 上下文.本地组.get(清单.path)
    let 状态: string
    if (本地 === undefined) 状态 = '本地缺失'
    else if (文件相同(本地, 清单) === true) 状态 = '已同步'
    else 状态 = '本地已修改'
    console.log(
      `[${清单.remote.target}] [${状态}] ${清单.path} (${格式化文件大小(清单.plaintext.size)}, scope: ${清单.scope})`,
    )
  }
  let 未登记组 = [...上下文.本地组.values()].filter(
    (项) => 上下文.清单组.has(项.path) === false && (选项.file === undefined || 文件匹配模式(项.path, 选项.file)),
  )
  for (let 未登记 of 未登记组) {
    console.log(`[未登记] [待上传] ${未登记.path} (${格式化文件大小(未登记.size)}, scope: ${未登记.scope})`)
  }
  console.log(`统计：清单共 ${String(候选清单.length)} 项，未登记 ${String(未登记组.length)} 项。`)
}

export type 状态选项 = { scope?: string | undefined; target?: string | undefined; file?: string | undefined }

export async function 状态(配置: 外挂LFS配置, 选项: 状态选项): Promise<void> {
  let 上下文 = await 创建上下文(配置, 选项.scope)
  let 候选清单 = 选中清单(上下文, { target: 选项.target, file: 选项.file })
  let 远端异常 = 0
  for (let 清单 of 候选清单) {
    let 仓库 = 上下文.仓库管理器.获取仓库(清单.remote.target)
    let 元数据 = await 仓库.查询(清单)
    if (元数据匹配(清单, 元数据) === false) {
      console.log(`[远端异常] ${清单.path} (目标: ${清单.remote.target})`)
      远端异常 += 1
    }
  }
  let 已修改 = 候选清单.filter((项) => {
    let 文件 = 上下文.本地组.get(项.path)
    return 文件 === undefined || 文件相同(文件, 项) === false
  }).length
  let 未登记组 = [...上下文.本地组.values()].filter(
    (项) => 上下文.清单组.has(项.path) === false && (选项.file === undefined || 文件匹配模式(项.path, 选项.file)),
  )
  console.log(
    `状态：清单 ${String(候选清单.length)}，本地变化 ${String(已修改)}，未登记 ${String(未登记组.length)}，远端异常 ${String(远端异常)}。`,
  )
  if (远端异常 > 0) process.exitCode = 1
}

export type 校验选项 = { scope?: string | undefined; target?: string | undefined; file?: string | undefined }

export async function 完整校验(配置: 外挂LFS配置, 选项: 校验选项): Promise<void> {
  let 上下文 = await 创建上下文(配置, 选项.scope)
  let 候选清单 = 选中清单(上下文, { target: 选项.target, file: 选项.file })
  let 数量 = 0
  for (let 清单 of 候选清单) {
    let 临时根 = 创建临时目录()
    let 密文路径 = path.join(临时根, 'object.enc')
    let 明文路径 = path.join(临时根, 'plain')
    try {
      let 仓库 = 上下文.仓库管理器.获取仓库(清单.remote.target)
      let 元数据 = await 仓库.下载(清单, 密文路径)
      if (元数据匹配(清单, 元数据) === false) throw new Error(`远端对象元数据与清单不一致: ${清单.path}`)
      await 解密文件(密文路径, 明文路径, 'object', 清单.id)
      let 摘要 = await 计算文件摘要(明文路径)
      if (摘要.size !== 清单.plaintext.size || 摘要.sha256 !== 清单.plaintext.sha256) {
        throw new Error(`远端内容哈希与清单不一致: ${清单.path}`)
      }
      console.log(`[校验通过] ${清单.path} (目标: ${清单.remote.target})`)
    } finally {
      fs.rmSync(临时根, { recursive: true, force: true })
    }
    数量 += 1
  }
  console.log(`完整校验完成：${String(数量)} 个对象。`)
}
