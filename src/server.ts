#!/usr/bin/env node
import { 应用单例 } from './app/app'
import { 测试服务关闭消息 } from './test-tools/test-service-protocol'
import { 启动异常兜底 } from './tools/fallback'

async function main(): Promise<void> {
  启动异常兜底(() => 应用单例.close())
  process.once('SIGINT', 请求关闭)
  process.once('SIGTERM', 请求关闭)
  await 应用单例.run()
  if (process.env['NODE_ENV'] === 'test') console.log('TEST_SERVER_READY')
}

async function 关闭应用(): Promise<void> {
  try {
    await 应用单例.close()
  } catch (错误) {
    console.error('关闭应用失败:', 错误)
    process.exitCode = 1
  }
}

let 请求关闭 = (): void => {
  void 关闭应用()
}

let 已请求测试关闭 = false
process.on('message', (消息: unknown): void => {
  if (process.env['NODE_ENV'] !== 'test' || 消息 !== 测试服务关闭消息 || 已请求测试关闭) return
  已请求测试关闭 = true
  void 关闭应用().then((): void => process.exit(process.exitCode ?? 0))
})

void main().catch(async (错误) => {
  console.error(错误)
  process.exitCode = 1
  await 关闭应用()
})
