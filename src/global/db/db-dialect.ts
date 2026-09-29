// ================= better-sqlite3 =================
// import SQLite from 'better-sqlite3'
// import { SqliteDialect } from 'kysely'

// export let 创建原生sqlite数据库适配器 = (path: string): SqliteDialect => {
//   return new SqliteDialect({ database: new SQLite(path) })
// }

// ================= node-sqlite3-wasm =================
import { NodeWasmDialect } from 'kysely-wasm'
import nodeSqlite3Wasm from 'node-sqlite3-wasm'

export let 创建sqlite数据库适配器 = (path: string): NodeWasmDialect => {
  return new NodeWasmDialect({ database: new nodeSqlite3Wasm.Database(path) })
}
