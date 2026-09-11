import * as path from 'node:path'

import { 清理快照根目录 } from '../../src/model/test-requirement'

async function 主函数(): Promise<void> {
  let 项目根目录 = path.resolve(import.meta.dirname, '../..')
  let 快照根目录 = path.resolve(项目根目录, 'test-outputs/requirement-snapshots')
  let 清理数量 = await 清理快照根目录(快照根目录)
  console.log(`已清理 ${String(清理数量)} 个需求测试快照：${快照根目录}`)
}

await 主函数()
