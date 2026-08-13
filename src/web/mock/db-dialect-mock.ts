import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'

/**
 * SQLite runs in a dedicated Worker and persists its database through IndexedDB.
 *
 * IndexedDB is used deliberately for broader browser compatibility. This path
 * does not depend on OPFS FileSystemSyncAccessHandle or SharedArrayBuffer.
 */
export let 创建sqlite数据库适配器 = (path: string): WaSqliteWorkerDialect =>
  new WaSqliteWorkerDialect({
    fileName: path.split(/[/\\]/).pop() ?? 'local.db',
    preferOPFS: false,
    worker: new Worker(new URL('../local-sqlite-worker.ts', import.meta.url), { type: 'module' }),
  })
