import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { 校验目标, 校验范围, 读取配置, 项目根目录 } from './config'
import { 规范路径 } from './local-store'
import { 列表, 完整校验, 拉取, 推送, 状态 } from './operations'

let 命令Schema = z.enum(['status', 'list', 'push', 'pull', 'verify'])

type 参数 = {
  命令: z.infer<typeof 命令Schema>
  config?: string | undefined
  scope?: string | undefined
  target?: string | undefined
  file?: string | undefined
  exact: boolean
  acceptDeletions: boolean
  yes: boolean
}

function 读取参数(): 参数 {
  let 命令 = 命令Schema.parse(process.argv[2])
  let 结果: 参数 = { 命令, exact: false, acceptDeletions: false, yes: false }
  let 参数组 = process.argv.slice(3)
  for (let 索引 = 0; 索引 < 参数组.length; 索引 += 1) {
    let 当前 = 参数组[索引]
    if (当前 === '--exact') {
      结果.exact = true
      continue
    }
    if (当前 === '--accept-deletions') {
      结果.acceptDeletions = true
      continue
    }
    if (当前 === '--yes' || 当前 === '-y') {
      结果.yes = true
      continue
    }
    if (当前 === '--config' || 当前 === '--scope' || 当前 === '--target' || 当前 === '--file' || 当前 === '--pattern') {
      let 值 = 参数组[索引 + 1]
      if (值 === undefined) throw new Error(`${当前} 缺少参数值`)
      if (当前 === '--config') 结果.config = 值
      else if (当前 === '--scope') 结果.scope = 值
      else if (当前 === '--target') 结果.target = 值
      else 结果.file = 规范路径(值)
      索引 += 1
      continue
    }
    throw new Error(`未知参数: ${当前 ?? ''}`)
  }
  if (命令 !== 'pull' && 结果.exact === true) throw new Error('--exact 仅可用于 pull')
  if (命令 !== 'push' && 结果.acceptDeletions === true) throw new Error('--accept-deletions 仅可用于 push')
  if (命令 !== 'push' && 结果.yes === true) throw new Error('--yes 仅可用于 push')
  return 结果
}

async function 主函数(): Promise<void> {
  let 参数 = 读取参数()
  let { 配置 } = 读取配置(参数.config)
  let scope = 校验范围(配置, 参数.scope)
  let target = 校验目标(配置, 参数.target)
  let file = 参数.file

  if (参数.命令 === 'push' || 参数.命令 === 'pull') {
    let 锁路径 = path.resolve(项目根目录, '.external-lfs/operation.lock')
    fs.mkdirSync(path.dirname(锁路径), { recursive: true })
    let 句柄: number
    try {
      句柄 = fs.openSync(锁路径, 'wx')
    } catch (错误) {
      throw new Error(`已有外挂 LFS 写操作正在运行；确认没有进程后可删除 ${锁路径}`, { cause: 错误 })
    }
    try {
      fs.writeFileSync(句柄, `${String(process.pid)}\n`)
      if (参数.命令 === 'push') {
        await 推送(配置, { scope, target, file, acceptDeletions: 参数.acceptDeletions, yes: 参数.yes })
      } else {
        await 拉取(配置, { scope, target, file, exact: 参数.exact })
      }
    } finally {
      fs.closeSync(句柄)
      fs.rmSync(锁路径, { force: true })
    }
    return
  }

  switch (参数.命令) {
    case 'list':
      await 列表(配置, { scope, target, file })
      break
    case 'status':
      await 状态(配置, { scope, target, file })
      break
    case 'verify':
      await 完整校验(配置, { scope, target, file })
      break
  }
}

await 主函数()
