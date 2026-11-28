import fs from 'node:fs'
import path from 'node:path'
import { 元数据匹配 } from './cloud-store'
import { 并发执行, 默认并发数 } from './concurrency'
import { 创建上下文, 文件相同, 格式化文件大小, 选中清单 } from './context'
import { 解密文件 } from './crypto'
import { 创建临时目录, 文件匹配模式, 计算文件摘要 } from './local-store'
import type { 外挂LFS配置 } from './model'

export type 列表选项 = { scope?: string | undefined; target?: string | undefined; file?: string | undefined }

export async function 列表(配置: 外挂LFS配置, 选项: 列表选项): Promise<void> {
  let 上下文 = await 创建上下文(配置, 选项.scope)
  let 候选清单 = 选中清单(上下文, { target: 选项.target, file: 选项.file })
  console.log('=== 外挂 LFS 文件清单 ===')
  for (let 清单 of 候选清单) {
    let 本地 = 上下文.本地组.get(清单.path)
    let 状态: string
    if (本地 === undefined && 配置.managedPaths.find((项) => 项.scope === 清单.scope)?.onDemand === true)
      状态 = '按需未拉取'
    else if (本地 === undefined) 状态 = '本地缺失'
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
  let 未拉取 = 候选清单.filter(
    (项) =>
      上下文.本地组.has(项.path) === false &&
      配置.managedPaths.find((范围) => 范围.scope === 项.scope)?.onDemand === true,
  ).length
  let 已修改 = 候选清单.filter((项) => {
    let 文件 = 上下文.本地组.get(项.path)
    if (文件 === undefined && 配置.managedPaths.find((范围) => 范围.scope === 项.scope)?.onDemand === true) return false
    return 文件 === undefined || 文件相同(文件, 项) === false
  }).length
  let 未登记组 = [...上下文.本地组.values()].filter(
    (项) => 上下文.清单组.has(项.path) === false && (选项.file === undefined || 文件匹配模式(项.path, 选项.file)),
  )
  console.log(
    `状态：清单 ${String(候选清单.length)}，本地变化 ${String(已修改)}，按需未拉取 ${String(未拉取)}，未登记 ${String(未登记组.length)}，远端异常 ${String(远端异常)}。`,
  )
  if (远端异常 > 0) process.exitCode = 1
}

export type 校验选项 = {
  scope?: string | undefined
  target?: string | undefined
  file?: string | undefined
  concurrency?: number | undefined
}

export async function 完整校验(配置: 外挂LFS配置, 选项: 校验选项): Promise<void> {
  let 上下文 = await 创建上下文(配置, 选项.scope)
  let 候选清单 = 选中清单(上下文, { target: 选项.target, file: 选项.file })
  await 并发执行(候选清单, 选项.concurrency ?? 默认并发数, async (清单): Promise<void> => {
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
  })
  console.log(`完整校验完成：${String(候选清单.length)} 个对象。`)
}
