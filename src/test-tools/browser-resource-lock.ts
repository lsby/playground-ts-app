import { mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** 与移动设备相同，以 SQLite 事务独占资源；进程退出时操作系统自动释放。 */
export async function 独占无头浏览器(
  会话: string,
  锁目录 = path.join(os.tmpdir(), 'requirement-test-browser'),
): Promise<() => void> {
  await mkdir(锁目录, { recursive: true })
  let { DatabaseSync } = await import('node:sqlite')
  let 锁 = new DatabaseSync(path.join(锁目录, 'headless.sqlite'))
  let 信息: InstanceType<typeof DatabaseSync> | undefined
  try {
    信息 = new DatabaseSync(path.join(锁目录, 'owner.sqlite'))
    信息.exec('PRAGMA busy_timeout = 1000')
    信息.exec('CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK (id = 1), description TEXT NOT NULL)')
    try {
      锁.exec('BEGIN IMMEDIATE')
    } catch (错误) {
      if (错误 instanceof Error === false || 'errcode' in 错误 === false || 错误.errcode !== 5) throw 错误
      let 占用 = 信息.prepare('SELECT description FROM owner WHERE id = 1').get()
      let 说明 = typeof 占用?.['description'] === 'string' ? 占用['description'] : '占用者正在启动'
      throw new Error(`已有无头测试浏览器：${说明}。请先关闭该会话再打开；框架不会关闭其他测试的浏览器。`, {
        cause: 错误,
      })
    }
    // 说明单独保存，其他连接读取时不会与资源事务争锁。
    信息.prepare('INSERT OR REPLACE INTO owner (id, description) VALUES (1, ?)').run(
      `PID ${String(process.pid)}，项目 ${process.cwd()}，会话 ${会话}`,
    )
  } catch (错误) {
    锁.close()
    throw 错误
  } finally {
    信息?.close()
  }
  let 已释放 = false
  return (): void => {
    if (已释放 === true) return
    已释放 = true
    锁.close()
  }
}
