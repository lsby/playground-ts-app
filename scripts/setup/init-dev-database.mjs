import { spawnSync } from 'node:child_process'
import path from 'node:path'

export function 执行开发数据库初始化(项目根目录) {
  console.log('\n开始初始化开发数据库。')
  let Tsx入口 = path.resolve(项目根目录, 'node_modules/tsx/dist/cli.mjs')
  let 结果 = spawnSync(process.execPath, [Tsx入口, 'scripts/task/index.ts', 'db:push:dev:web'], {
    cwd: 项目根目录,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (结果.error instanceof Error) throw 结果.error
  if (结果.status !== 0) throw new Error(`初始化开发数据库失败，退出码：${String(结果.status)}`)
  console.log('开发数据库初始化完成。\n')
}
