/// <reference lib="webworker" />

import { initSQLiteCore } from '@subframe7536/sqlite-wasm'
import { SQLITE_DONE, SQLITE_ROW } from '@subframe7536/sqlite-wasm/constant'
import { useIdbStorage } from '@subframe7536/sqlite-wasm/idb'
import { createOnMessageCallback } from 'kysely-wasqlite-worker'
import { z } from 'zod'

createOnMessageCallback(
  async ({ fileName, url }) => await initSQLiteCore(useIdbStorage(fileName, url === undefined ? {} : { url })),
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
