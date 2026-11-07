import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'
import { 项目标识 } from '../../app/meta-info'

/**
 * SQLite runs in a dedicated Worker and persists its database through IndexedDB.
 *
 * IndexedDB is used deliberately for broader browser compatibility. This path
 * does not depend on OPFS FileSystemSyncAccessHandle or SharedArrayBuffer.
 */
/**
 * 浏览器 SQLite 适配器通过独立工作线程访问 IndexedDB 中的数据库。
 * 它保管工作线程，并让驱动回收与显式回收共用同一次终止操作。
 */
class 浏览器SQLite数据库适配器 extends WaSqliteWorkerDialect {
  private readonly 工作线程: Worker
  private 是否已关闭 = false

  public constructor(fileName: string) {
    let 工作线程 = new Worker(new URL('../pure-frontend/local-sqlite-worker.ts', import.meta.url), { type: 'module' })
    super({ fileName, preferOPFS: false, worker: 工作线程 })
    this.工作线程 = 工作线程
    let 原始终止 = 工作线程.terminate.bind(工作线程)
    工作线程.terminate = (): void => {
      if (this.是否已关闭 === true) return
      原始终止()
      this.是否已关闭 = true
    }
  }

  public 关闭(): void {
    this.工作线程.terminate()
  }
}

export let 创建浏览器sqlite数据库适配器 = (fileName: string): 浏览器SQLite数据库适配器 =>
  new 浏览器SQLite数据库适配器(fileName)

export function 创建sqlite数据库适配器(path: string): 浏览器SQLite数据库适配器 {
  let 文件名 = path.split(/[/\\]/).pop()
  if (文件名 === undefined || 文件名 === '') throw new Error('无法从数据库路径获得文件名')
  return 创建浏览器sqlite数据库适配器(`${项目标识}-${文件名}`)
}
