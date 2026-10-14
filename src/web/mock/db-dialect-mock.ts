import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'
import { 项目标识 } from '../../app/meta-info'

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

export function 创建sqlite数据库适配器(path: string): WaSqliteWorkerDialect {
  let 文件名 = path.split(/[/\\]/).pop()
  if (文件名 === undefined || 文件名 === '') throw new Error('无法从数据库路径获得文件名')
  return 创建浏览器sqlite数据库适配器(`${项目标识}-${文件名}`)
}
