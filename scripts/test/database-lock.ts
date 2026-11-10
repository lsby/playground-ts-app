import { access, mkdir } from 'node:fs/promises'
import path from 'node:path'

import { 获得环境变量 } from '../../src/global/env'

async function 确认没有旧锁(锁路径: string): Promise<void> {
  try {
    await access(锁路径)
  } catch (错误) {
    if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'ENOENT') return
    throw 错误
  }
  throw new Error(`发现旧版测试数据库锁。确认对应测试进程均已退出后再移除 ${锁路径}`)
}

export async function 独占测试数据库(项目根目录: string): Promise<() => void> {
  let 配置 = 获得环境变量()
  if (配置.NODE_ENV !== 'test' || 配置.BUILD_TARGET !== 'web') throw new Error('仅允许独占 Web 测试数据库')
  let 锁路径 = `${path.resolve(项目根目录, 配置.DB_PATH)}.test.lock`
  await mkdir(path.dirname(锁路径), { recursive: true })
  await 确认没有旧锁(锁路径)
  let { DatabaseSync } = await import('node:sqlite')
  let 互斥锁 = new DatabaseSync(`${锁路径}.sqlite`)
  try {
    互斥锁.exec('BEGIN IMMEDIATE')
  } catch (错误) {
    互斥锁.close()
    if (错误 instanceof Error && 'errcode' in 错误 && 错误.errcode === 5)
      throw new Error(`测试数据库正在使用：${锁路径}.sqlite`, { cause: 错误 })
    throw 错误
  }
  // 事务由 SQLite 和操作系统在连接或进程退出时释放。保留锁文件供下一次使用。
  return (): void => 互斥锁.close()
}
