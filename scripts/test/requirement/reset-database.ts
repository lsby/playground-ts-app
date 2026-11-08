import { 获得环境变量 } from '../../../src/global/env'
import { 全局资源 } from '../../../src/global/global'
import { init } from '../../../src/init/init'
import { cleanDB } from '../../db/clean-db'

let 配置 = 获得环境变量()
if (配置.NODE_ENV !== 'test' || 配置.BUILD_TARGET !== 'web') throw new Error('仅允许重置 Web 测试数据库')
try {
  await cleanDB(全局资源.获得数据库().获得句柄())
  await init()
} finally {
  await 全局资源.关闭()
}
