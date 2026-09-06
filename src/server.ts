#!/usr/bin/env node
import { 应用单例 } from './app/app'
import { 启动异常兜底 } from './tools/fallback'

async function main(): Promise<void> {
  启动异常兜底(() => 应用单例.close())
  process.once('SIGINT', 请求关闭)
  process.once('SIGTERM', 请求关闭)
  await 应用单例.run()
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
void main().catch(async (错误) => {
  console.error(错误)
  process.exitCode = 1
  await 关闭应用()
})
