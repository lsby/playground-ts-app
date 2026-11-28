import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

let PNG签名 = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
let 执行文件 = promisify(execFile)

/**
 * 用 simctl 截模拟器整屏（PNG，像素是点的 3 倍），校验确实是 PNG。
 * 超时或取消用 SIGKILL：simctl 卡住时可能忽略默认的 SIGTERM，进程不退出 promise 就永远不结束，设备占用也就不释放。
 */
export async function 截取模拟器画面(设备: string, 信号: AbortSignal): Promise<Buffer> {
  let 目录 = await mkdtemp(path.join(os.tmpdir(), 'mobile-test-ios-shot-'))
  try {
    let 文件 = path.join(目录, 'screen.png')
    await 执行文件('xcrun', ['simctl', 'io', 设备, 'screenshot', '--type=png', 文件], {
      signal: 信号,
      timeout: 30_000,
      killSignal: 'SIGKILL',
    })
    let 图片 = await readFile(文件)
    if (图片.length < 24 || 图片.subarray(0, 8).equals(PNG签名) === false) throw new Error('iOS 截图不是有效的 PNG')
    return 图片
  } finally {
    await rm(目录, { recursive: true, force: true })
  }
}
