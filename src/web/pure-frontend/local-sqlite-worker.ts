/// <reference lib="webworker" />

import { initSQLiteCore } from '@subframe7536/sqlite-wasm'
import { useIdbStorage } from '@subframe7536/sqlite-wasm/idb'
import { createOnMessageCallback } from 'kysely-wasqlite-worker'

createOnMessageCallback(
  async ({ fileName, url }) => await initSQLiteCore(useIdbStorage(fileName, url === undefined ? {} : { url })),
)
