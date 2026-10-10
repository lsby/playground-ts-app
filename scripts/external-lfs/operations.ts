import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { type 云存储仓库, 元数据匹配 } from './cloud-store'
import { 项目根目录 } from './config'
import { 加密文件, 解密文件 } from './crypto'
import { 写入清单, 创建临时目录, 删除清单, 扫描本地文件, 计算文件摘要, 读取清单组 } from './local-store'
import type { 外挂LFS配置, 本地文件, 清单 } from './model'
import { 创建云存储仓库 } from './repository'

type 操作上下文 = {
  配置: 外挂LFS配置
  scope?: string
  仓库: 云存储仓库
  清单组: Map<string, 清单>
  本地组: Map<string, 本地文件>
}

async function 创建上下文(配置: 外挂LFS配置, scope?: string): Promise<操作上下文> {
  let 清单组 = await 读取清单组(配置)
  let 本地组 = await 扫描本地文件(配置, scope)
  return { 配置, ...(scope === undefined ? {} : { scope }), 仓库: 创建云存储仓库(配置), 清单组, 本地组 }
}

function 选中清单(上下文: 操作上下文): 清单[] {
  return [...上下文.清单组.values()]
    .filter((项) => 上下文.scope === undefined || 项.scope === 上下文.scope)
    .sort((左, 右) => 左.path.localeCompare(右.path))
}

function 文件相同(文件: 本地文件, 清单: 清单): boolean {
  return 文件.size === 清单.plaintext.size && 文件.sha256 === 清单.plaintext.sha256
}

async function 上传一个(上下文: 操作上下文, 文件: 本地文件, 旧清单?: 清单): Promise<void> {
  if (文件.size > 5 * 1024 * 1024 * 1024) throw new Error(`第一版单文件上限为 5 GiB: ${文件.path}`)
  let id = 旧清单?.id ?? crypto.randomUUID()
  let objectKey = `${上下文.配置.remotePrefix}/objects/${crypto.randomUUID()}.bin`
  let 临时根 = 创建临时目录()
  let 密文路径 = path.join(临时根, 'object.enc')
  try {
    await 加密文件(文件.absolutePath, 密文路径, 'object', id)
    if (fs.statSync(密文路径).size > 5 * 1024 * 1024 * 1024) {
      throw new Error(`第一版加密后单文件上限为 5 GiB: ${文件.path}`)
    }
    let 元数据 = await 上下文.仓库.上传(objectKey, 密文路径)
    let 清单: 清单 = {
      version: 1,
      id,
      path: 文件.path,
      scope: 文件.scope,
      plaintext: { size: 文件.size, sha256: 文件.sha256 },
      remote: { provider: 上下文.配置.provider, objectKey, ...元数据 },
      updatedAt: new Date().toISOString(),
    }
    await 写入清单(上下文.配置, 清单)
    console.log(`[上传] ${文件.path}`)
  } finally {
    fs.rmSync(临时根, { recursive: true, force: true })
  }
}

export async function 推送(配置: 外挂LFS配置, scope: string | undefined, 接受删除: boolean): Promise<void> {
  let 上下文 = await 创建上下文(配置, scope)
  let 缺失 = 选中清单(上下文).filter((项) => 上下文.本地组.has(项.path) === false)
  if (缺失.length > 0 && 接受删除 === false) {
    throw new Error(`本地缺少 ${String(缺失.length)} 个已登记文件；确认删除时重新运行并传入 --accept-deletions`)
  }
  let 变化数 = 0
  for (let 文件 of 上下文.本地组.values()) {
    let 旧清单 = 上下文.清单组.get(文件.path)
    if (旧清单 !== undefined && 文件相同(文件, 旧清单) === true) continue
    await 上传一个(上下文, 文件, 旧清单)
    变化数 += 1
  }
  for (let 清单 of 缺失) {
    删除清单(配置, 清单)
    console.log(`[取消登记] ${清单.path}（远端历史对象保留）`)
  }
  console.log(`推送完成：上传 ${String(变化数)}，取消登记 ${String(缺失.length)}。请提交加密清单。`)
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
    let 元数据 = await 上下文.仓库.下载(清单, 密文路径)
    if (元数据匹配(清单, 元数据) === false) throw new Error(`远端对象元数据与清单不一致: ${清单.path}`)
    await 解密文件(密文路径, 明文路径, 'object', 清单.id)
    let 摘要 = await 计算文件摘要(明文路径)
    if (摘要.size !== 清单.plaintext.size || 摘要.sha256 !== 清单.plaintext.sha256) {
      throw new Error(`下载内容哈希与清单不一致: ${清单.path}`)
    }
    fs.mkdirSync(path.dirname(目标), { recursive: true })
    fs.renameSync(明文路径, 目标)
    console.log(`[下载] ${清单.path}`)
  } finally {
    fs.rmSync(临时根, { recursive: true, force: true })
  }
}

export async function 拉取(配置: 外挂LFS配置, scope: string | undefined, 精确同步: boolean): Promise<void> {
  let 上下文 = await 创建上下文(配置, scope)
  let 恢复根 = 精确同步 === true ? 恢复目录() : undefined
  let 下载数 = 0
  for (let 清单 of 选中清单(上下文)) {
    let 文件 = 上下文.本地组.get(清单.path)
    if (文件 !== undefined && 文件相同(文件, 清单) === true) continue
    await 下载一个(上下文, 清单, 恢复根)
    下载数 += 1
  }
  let 多余文件 = [...上下文.本地组.values()].filter((项) => 上下文.清单组.has(项.path) === false)
  if (精确同步 === true && 恢复根 !== undefined) {
    for (let 文件 of 多余文件) 移入恢复区(文件.absolutePath, 文件.path, 恢复根)
  }
  console.log(`拉取完成：下载 ${String(下载数)}，本地额外文件 ${String(多余文件.length)}。`)
}

export async function 状态(配置: 外挂LFS配置, scope?: string): Promise<void> {
  let 上下文 = await 创建上下文(配置, scope)
  let 远端异常 = 0
  for (let 清单 of 选中清单(上下文)) {
    let 元数据 = await 上下文.仓库.查询(清单)
    if (元数据匹配(清单, 元数据) === false) {
      console.log(`[远端异常] ${清单.path}`)
      远端异常 += 1
    }
  }
  let 已修改 = 选中清单(上下文).filter((项) => {
    let 文件 = 上下文.本地组.get(项.path)
    return 文件 === undefined || 文件相同(文件, 项) === false
  }).length
  let 未登记 = [...上下文.本地组.values()].filter((项) => 上下文.清单组.has(项.path) === false).length
  console.log(
    `状态：清单 ${String(选中清单(上下文).length)}，本地变化 ${String(已修改)}，未登记 ${String(未登记)}，远端异常 ${String(远端异常)}。`,
  )
  if (远端异常 > 0) process.exitCode = 1
}

export async function 完整校验(配置: 外挂LFS配置, scope?: string): Promise<void> {
  let 上下文 = await 创建上下文(配置, scope)
  let 数量 = 0
  for (let 清单 of 选中清单(上下文)) {
    let 临时根 = 创建临时目录()
    let 密文路径 = path.join(临时根, 'object.enc')
    let 明文路径 = path.join(临时根, 'plain')
    try {
      let 元数据 = await 上下文.仓库.下载(清单, 密文路径)
      if (元数据匹配(清单, 元数据) === false) throw new Error(`远端对象元数据与清单不一致: ${清单.path}`)
      await 解密文件(密文路径, 明文路径, 'object', 清单.id)
      let 摘要 = await 计算文件摘要(明文路径)
      if (摘要.size !== 清单.plaintext.size || 摘要.sha256 !== 清单.plaintext.sha256) {
        throw new Error(`远端内容哈希与清单不一致: ${清单.path}`)
      }
      console.log(`[校验通过] ${清单.path}`)
    } finally {
      fs.rmSync(临时根, { recursive: true, force: true })
    }
    数量 += 1
  }
  console.log(`完整校验完成：${String(数量)} 个对象。`)
}
