import { mkdir, open, unlink, type FileHandle } from 'node:fs/promises'
import path from 'node:path'

import { 获得环境变量 } from '../../src/global/env'

export async function 独占测试数据库(项目根目录: string): Promise<() => Promise<void>> {
  let 配置 = 获得环境变量()
  if (配置.NODE_ENV !== 'test' || 配置.BUILD_TARGET !== 'web') throw new Error('仅允许独占 Web 测试数据库')
  let 锁路径 = `${path.resolve(项目根目录, 配置.DB_PATH)}.test.lock`
  await mkdir(path.dirname(锁路径), { recursive: true })
  let 文件: FileHandle
  try {
    文件 = await open(锁路径, 'wx')
  } catch (错误) {
    if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'EEXIST')
      throw new Error(`测试数据库正在使用。若相关进程已退出，可删除锁文件：${锁路径}`, { cause: 错误 })
    throw 错误
  }
  return async (): Promise<void> => {
    try {
      await 文件.close()
    } finally {
      await unlink(锁路径)
    }
  }
}
