import path from 'path'
import { 命令 } from './task-runner'

export let 项目根目录 = path.resolve(import.meta.dirname, '../..')
export let 完整调试环境 = { DEBUG: '@lsby:*,@lsby:playground-ts-app:*,-@lsby:ts-env*' }
export let 生成调试环境 = { DEBUG: '@lsby:*' }
export let 测试调试环境 = { DEBUG: '@lsby:*,@lsby:playground-ts-app:*,-@lsby:ts-env*,-*:trace' }
export let Web开发环境文件 = '.env/.env.development.web'
export let Web预览开发环境文件 = '.env/.env.development.web-preview'
export let Electron开发环境文件 = '.env/.env.development.electron'
export let 纯前端开发环境文件 = '.env/.env.development.pure-frontend'
export let Web生产环境文件 = '.env/.env.production.web'
export let Electron生产环境文件 = '.env/.env.production.electron'
export let Sea生产环境文件 = '.env/.env.production.sea'
export let 纯前端生产环境文件 = '.env/.env.production.pure-frontend'
export let 测试环境文件 = '.env/.env.test.web'
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
export let 生成Web页面入口命令 = 命令('tsx', 'scripts/gen/gen-web-page-entry.ts')
export let 生成本地API列表命令 = 命令('tsx', 'scripts/gen/gen-local-api-list.ts')
export let 生成本地Schema命令 = 命令('tsx', 'scripts/gen/gen-local-schema.ts')
