import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'
import { 项目标识 } from '../../app/meta-info'

let 运行时数据库文件名: string | undefined

export function 设置浏览器运行时数据库文件名(文件名: string): void {
  if (运行时数据库文件名 !== undefined && 运行时数据库文件名 !== 文件名)
    throw new Error(`浏览器运行时数据库已绑定为 ${运行时数据库文件名}，不能切换到 ${文件名}`)
  运行时数据库文件名 = 文件名
}

/**
 * SQLite runs in a dedicated Worker and persists its database through IndexedDB.
 *
 * IndexedDB is used deliberately for broader browser compatibility. This path
 * does not depend on OPFS FileSystemSyncAccessHandle or SharedArrayBuffer.
 */
export let 创建浏览器sqlite数据库适配器 = (fileName: string): WaSqliteWorkerDialect =>
  new WaSqliteWorkerDialect({
    fileName,
    preferOPFS: false,
    worker: new Worker(new URL('../pure-frontend/local-sqlite-worker.ts', import.meta.url), { type: 'module' }),
  })

export let 创建sqlite数据库适配器 = (path: string): WaSqliteWorkerDialect =>
  创建浏览器sqlite数据库适配器(运行时数据库文件名 ?? `${项目标识}-${path.split(/[/\\]/).pop() ?? 'local.db'}`)
