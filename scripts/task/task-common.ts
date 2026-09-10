import path from 'path'
import { 获得环境文件 } from '../setup/env-files-core.mjs'
import { 命令 } from './task-runner'

export let 项目根目录 = path.resolve(import.meta.dirname, '../..')
export let 完整调试环境 = { DEBUG: '@lsby:*,@lsby:playground-ts-app:*,-@lsby:ts-env*' }
export let 生成调试环境 = { DEBUG: '@lsby:*' }
export let 测试调试环境 = { DEBUG: '@lsby:*,-@lsby:ts-env*,-*:trace' }
export let Web开发环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'development', BUILD_TARGET: 'web' })
export let Electron开发环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'development', BUILD_TARGET: 'electron' })
export let 纯前端开发环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'development', BUILD_TARGET: 'pure-frontend' })
export let Web生产环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'production', BUILD_TARGET: 'web' })
export let Electron生产环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'production', BUILD_TARGET: 'electron' })
export let Sea生产环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'production', BUILD_TARGET: 'sea' })
export let 纯前端生产环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'production', BUILD_TARGET: 'pure-frontend' })
export let 测试环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'test', BUILD_TARGET: 'web' })
export let Web入口 = 'src/web/page/**/*.html'
export let Parcel基础参数 = ['build', '--no-autoinstall', '--no-cache', '--no-source-maps', Web入口]
export let 生成API列表命令 = 命令(
  'lsby-net-core-gen-api-list',
  './tsconfig.json',
  './src/interface',
  './src/interface/interface-list.ts',
)
export let 生成API类型命令 = 命令(
  'lsby-net-core-gen-api-type',
  './tsconfig.json',
  './src/interface',
  './src/types/interface-type.ts',
)
export let 生成Web索引命令 = 命令('tsx', 'scripts/gen/gen-web-index.ts')
export let 生成本地API列表命令 = 命令('tsx', 'scripts/gen/gen-local-api-list.ts')
export let 生成本地Schema命令 = 命令('tsx', 'scripts/gen/gen-local-schema.ts')
