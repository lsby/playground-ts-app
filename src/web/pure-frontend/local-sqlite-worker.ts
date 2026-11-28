/// <reference lib="webworker" />

import { close, initSQLiteCore, query, run } from '@subframe7536/sqlite-wasm'
import { SQLITE_DONE, SQLITE_ROW } from '@subframe7536/sqlite-wasm/constant'
import { useIdbStorage } from '@subframe7536/sqlite-wasm/idb'
import { createOnMessageCallback } from 'kysely-wasqlite-worker'
import { z } from 'zod'

createOnMessageCallback(
  async ({ fileName, url }) => {
    let 数据库 = await initSQLiteCore(useIdbStorage(fileName, url === undefined ? {} : { url }))
    try {
      await run(数据库, 'PRAGMA foreign_keys = ON')
      z.array(z.object({ foreign_keys: z.literal(1) }).strict())
        .length(1)
        .parse(await query(数据库, 'PRAGMA foreign_keys'))
      return 数据库
    } catch (错误) {
      await close(数据库)
      throw 错误
    }
  },
  async (executor, request): Promise<unknown> => {
    if (request.type !== 'execute-script') throw new Error(`不支持的 SQLite Worker 请求: ${request.type}`)
    let SQL = z.string().parse(request.payload)
    for await (let statement of executor.db.sqlite.statements(executor.db.pointer, SQL)) {
      let 结果 = await executor.db.sqlite.step(statement)
      while (结果 === SQLITE_ROW) 结果 = await executor.db.sqlite.step(statement)
      if (结果 !== SQLITE_DONE) throw new Error(`SQLite 脚本执行失败，状态码: ${结果}`)
    }
    return null
  },
)
