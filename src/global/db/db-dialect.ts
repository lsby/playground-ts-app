// ================= better-sqlite3 =================
// import SQLite from 'better-sqlite3'
// import { SqliteDialect } from 'kysely'

// export let 创建原生sqlite数据库适配器 = (path: string): SqliteDialect => {
//   return new SqliteDialect({ database: new SQLite(path) })
// }

// ================= node-sqlite3-wasm =================
import { NodeWasmDialect } from 'kysely-wasm'
import type nodeSqlite3Wasm from 'node-sqlite3-wasm'
import { createRequire } from 'node:module'

/**
 * SQLite 数据库适配器持有当前连接，并将它交给 Kysely 执行查询。
 * 连接在构造时打开，既可由驱动关闭，也可在尚未执行查询时显式释放。
 */
class SQLite数据库适配器 extends NodeWasmDialect {
  private readonly 数据库: nodeSqlite3Wasm.Database

  public constructor(path: string) {
    // 固定依赖的同步加载边界：ESM 使用 createRequire，SEA 保留可被打包器识别的字面 require。
    let 驱动 = (
      typeof require === 'function' ? require('node-sqlite3-wasm') : createRequire(import.meta.url)('node-sqlite3-wasm')
    ) as typeof nodeSqlite3Wasm
    let 数据库 = new 驱动.Database(path)
    super({ database: 数据库 })
    this.数据库 = 数据库
  }

  public 关闭(): void {
    if (this.数据库.isOpen === true) this.数据库.close()
  }
}

export let 创建sqlite数据库适配器 = (path: string): SQLite数据库适配器 => new SQLite数据库适配器(path)
