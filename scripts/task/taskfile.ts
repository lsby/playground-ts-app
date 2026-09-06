import path from 'path'
import { 获得环境文件 } from '../setup/env-files-core.mjs'
import { 获得单元测试生成参数 } from '../test/unit-test-config'
import { 命令, 定义任务 } from './task-runner'

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 完整调试环境 = { DEBUG: '@lsby:*,@lsby:playground-ts-app:*,-@lsby:ts-env*' }
let 生成调试环境 = { DEBUG: '@lsby:*' }
let 测试调试环境 = { DEBUG: '@lsby:*,-@lsby:ts-env*,-*:trace' }
let Web开发环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'development', BUILD_TARGET: 'web' })
let Electron开发环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'development', BUILD_TARGET: 'electron' })
let 纯前端开发环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'development', BUILD_TARGET: 'pure-frontend' })
let Web生产环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'production', BUILD_TARGET: 'web' })
let Electron生产环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'production', BUILD_TARGET: 'electron' })
let Sea生产环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'production', BUILD_TARGET: 'sea' })
let 纯前端生产环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'production', BUILD_TARGET: 'pure-frontend' })
let 测试环境文件 = 获得环境文件(项目根目录, { NODE_ENV: 'test', BUILD_TARGET: 'web' })
let Web入口 = 'src/web/page/**/*.html'
let Parcel基础参数 = ['build', '--no-autoinstall', '--no-cache', '--no-source-maps', Web入口]
let 生成API列表命令 = 命令(
  'lsby-net-core-gen-api-list',
  './tsconfig.json',
  './src/interface',
  './src/interface/interface-list.ts',
)
let 生成API类型命令 = 命令(
  'lsby-net-core-gen-api-type',
  './tsconfig.json',
  './src/interface',
  './src/types/interface-type.ts',
)
let 生成Web索引命令 = 命令('tsx', 'scripts/gen/gen-web-index.ts')
let 生成本地API列表命令 = 命令('tsx', 'scripts/gen/gen-local-api-list.ts')
let 生成本地Schema命令 = 命令('tsx', 'scripts/gen/gen-local-schema.ts')

export let 任务表 = 定义任务({
  'generate:db-type': {
    说明: '生成 Kysely 数据库类型',
    运行: 命令('prisma', 'generate'),
    环境变量: { DB_PATH_PRISMA: 'file:./db/generate-types.db' },
    公开: false,
  },
  'generate:api-list': { 说明: '生成 API 接口列表', 运行: 生成API列表命令, 环境变量: 完整调试环境, 公开: false },
  'generate:api-type': { 说明: '生成 API 接口类型', 运行: 生成API类型命令, 环境变量: 完整调试环境, 公开: false },
  'generate:web-index': { 说明: '生成 Web 组件索引', 运行: 生成Web索引命令, 公开: false },
  'generate:local-api-list': { 说明: '生成纯前端本地 API 列表', 运行: 生成本地API列表命令, 公开: false },
  'generate:local-schema': { 说明: '生成纯前端本地数据库 Schema', 运行: 生成本地Schema命令, 公开: false },
  'generate:meta': { 说明: '生成应用元信息', 运行: 命令('tsx', 'scripts/gen/gen-meta-info.ts'), 公开: false },
  generate: {
    说明: '生成全部派生文件',
    依赖: [
      'generate:db-type',
      'generate:api-list',
      'generate:api-type',
      'generate:web-index',
      'generate:local-api-list',
      'generate:local-schema',
      'generate:meta',
    ],
  },
  'check:format': { 说明: '检查代码格式', 运行: 命令('prettier', '--check', '.'), 公开: false },
  'check:lint': { 说明: '运行 ESLint', 运行: 命令('eslint', '.'), 公开: false },
  'check:type': { 说明: '运行 TypeScript 类型检查', 运行: 命令('tsc', '--noEmit'), 公开: false },
  check: { 说明: '运行全部静态检查', 依赖: ['check:format', 'check:lint', 'check:type'] },
  'fix:format': { 说明: '写入代码格式', 运行: 命令('prettier', '--write', '.'), 公开: false },
  'fix:lint': { 说明: '应用 ESLint 自动修复', 运行: 命令('eslint', '.', '--fix'), 公开: false },
  fix: { 说明: '修复并格式化代码', 依赖: ['fix:lint', 'fix:format'] },
  'clean:all': { 说明: '清理全部构建产物和缓存', 运行: 命令('tsx', 'scripts/clean/clean-all.ts') },
  'clean:web': { 说明: '清理 Web 构建产物和缓存', 运行: 命令('tsx', 'scripts/clean/clean-web.ts') },
  'clean:web-test': { 说明: '清理 Web 测试构建产物', 运行: 命令('tsx', 'scripts/clean/clean-web-test.ts') },
  'compile:service': {
    说明: '编译服务端 TypeScript',
    运行: [命令('tsc', '--project', './tsconfig.build.json'), 命令('tsc-alias', '-p', './tsconfig.build.json', '-f')],
    公开: false,
  },
  'bundle:web': {
    说明: '打包普通 Web 前端',
    运行: 命令('parcel', ...Parcel基础参数, '--dist-dir', 'dist/src/web'),
    公开: false,
  },
  'bundle:web-no-scope-hoist': {
    说明: '以禁用 Scope Hoisting 的方式打包 Web 前端',
    运行: 命令('parcel', ...Parcel基础参数, '--no-scope-hoist', '--dist-dir', 'dist/src/web'),
    公开: false,
  },
  'bundle:web-test': {
    说明: '打包端到端测试使用的 Web 前端',
    运行: 命令('parcel', ...Parcel基础参数, '--dist-dir', 'test-outputs/web-test'),
    公开: false,
  },
  'post-build': { 说明: '执行构建后处理', 运行: 命令('tsx', 'scripts/post-build/index.ts'), 公开: false },
  'build:all': {
    说明: '生成、检查并构建服务端和 Web',
    依赖: ['generate', 'check', 'clean:all', 'compile:service', 'bundle:web', 'post-build'],
    需要环境文件: true,
  },
  'build:web': {
    说明: '生成、检查并构建普通 Web',
    依赖: ['generate', 'check', 'clean:web', 'bundle:web'],
    需要环境文件: true,
  },
  'build:web:no-scope-hoist': {
    说明: '生成、检查并构建禁用 Scope Hoisting 的 Web',
    依赖: ['generate', 'check', 'clean:web', 'bundle:web-no-scope-hoist'],
    需要环境文件: true,
  },
  'build:web:pure-frontend': {
    说明: '生成、检查并构建纯前端版本',
    依赖: ['generate', 'check', 'clean:web', 'bundle:web-no-scope-hoist'],
    需要环境文件: true,
  },
  'build:web:test': {
    说明: '生成并构建端到端测试前端',
    环境文件: 测试环境文件,
    依赖: ['generate', 'clean:web-test', 'bundle:web-test'],
  },

  setup: { 说明: '初始化本地配置并分配端口', 依赖: ['setup:env', 'setup:ports'] },
  'setup:init': { 说明: '重新运行项目初始化向导', 运行: 命令('node', 'scripts/setup/preinstall.mjs', '--force') },
  'setup:env': { 说明: '从示例初始化本地配置', 运行: 命令('tsx', 'scripts/setup/init-env.ts'), 传递参数: true },
  'setup:ports': { 说明: '扫描并分配本地端口', 运行: 命令('tsx', 'scripts/setup/init-ports.ts'), 传递参数: true },
  'setup:github-electron-env': {
    说明: '配置 Electron GitHub Actions 环境文件 Secret',
    运行: 命令('tsx', 'scripts/setup/github-electron-env.ts'),
    传递参数: true,
  },
  'setup:rename': { 说明: '重命名项目', 运行: 命令('tsx', 'scripts/setup/rename-project.ts') },

  'db:push:dev:web': {
    说明: '初始化或迁移 Web 开发数据库并生成类型',
    环境文件: Web开发环境文件,
    运行: 命令('tsx', 'scripts/db/push-dev.ts'),
  },
  'db:push:prod:web': {
    说明: '更新 Web 生产数据库并生成数据库类型',
    环境文件: Web生产环境文件,
    运行: 命令('tsx', 'scripts/db/push-prod.ts', '--generate'),
  },
  'db:push:prod:electron': {
    说明: '更新 Electron 生产数据库并生成数据库类型',
    环境文件: Electron生产环境文件,
    运行: 命令('tsx', 'scripts/db/push-prod.ts', '--generate'),
  },
  'db:push:prod:sea': {
    说明: '更新 SEA 生产数据库并生成数据库类型',
    环境文件: Sea生产环境文件,
    运行: 命令('tsx', 'scripts/db/push-prod.ts', '--generate'),
  },
  'db:push:test:web': {
    说明: '更新 Web 测试数据库并生成数据库类型',
    环境文件: 测试环境文件,
    运行: 命令('tsx', 'scripts/db/push-prod.ts', '--generate'),
  },
  'db:ensure:test:web': {
    说明: '确保 Web 测试数据库存在并应用已有迁移',
    环境文件: 测试环境文件,
    运行: 命令('tsx', 'scripts/db/push-prod.ts', '--ensure'),
    公开: false,
  },

  'run:service:dev': {
    说明: '启动 Web 开发服务端',
    环境文件: Web开发环境文件,
    环境变量: 完整调试环境,
    运行: 命令(
      'tsx',
      'watch',
      '--exclude',
      './src/types/**/*',
      '--exclude',
      './src/interface/interface-list.ts',
      '--inspect',
      './src/server.ts',
    ),
  },
  'run:service:prod': {
    说明: '启动 Web 生产服务端',
    环境文件: Web生产环境文件,
    环境变量: 完整调试环境,
    运行: 命令('node', './dist/src/server.js'),
  },
  'run:service:test': {
    说明: '启动 Web 测试服务端',
    环境文件: 测试环境文件,
    环境变量: 完整调试环境,
    运行: 命令('tsx', './src/server.ts'),
  },
  'run:web:dev': {
    说明: '启动 Web 前端开发服务器',
    环境文件: Web开发环境文件,
    依赖: ['clean:web'],
    运行: 命令('tsx', 'scripts/web/web-run.ts'),
  },
  'run:pure-frontend:dev': {
    说明: '启动纯前端开发服务器',
    环境文件: 纯前端开发环境文件,
    依赖: ['clean:web'],
    运行: 命令('tsx', 'scripts/web/web-run.ts'),
  },
  'run:electron:dev': {
    说明: '启动 Electron 开发后端',
    环境文件: Electron开发环境文件,
    环境变量: 完整调试环境,
    运行: [
      命令(
        'node',
        '-e',
        "if (process.platform === 'win32') { try { require('child_process').execSync('chcp 65001', { stdio: 'inherit' }); } catch {} }",
      ),
      命令(
        'nodemon',
        '--watch',
        'src',
        '--ext',
        'ts',
        '--ignore',
        'src/types/**/*',
        '--ignore',
        'src/interface/interface-list.ts',
        '--ignore',
        'src/web/**/*',
        '--exec',
        'electron -r tsx src/electron.ts',
      ),
    ],
  },
  'run:electron:prod': {
    说明: '启动 Electron 生产后端',
    环境文件: Electron生产环境文件,
    环境变量: 完整调试环境,
    运行: 命令('electron', '-r', 'tsx', 'dist/src/electron.js'),
  },

  'watch:type': { 说明: '持续运行 TypeScript 类型检查', 运行: 命令('tsc', '--noEmit', '-w'), 公开: false },
  'watch:lint': {
    说明: '持续运行 ESLint 检查',
    运行: 命令('tsx', 'scripts/watch/watch.ts', 'src', 'scripts', '--', 'eslint', '.'),
    公开: false,
  },
  'watch:api-list': {
    说明: '持续生成 API 接口列表',
    环境变量: 生成调试环境,
    运行: 命令(
      'tsx',
      'scripts/watch/watch.ts',
      './src/interface/',
      '--',
      生成API列表命令.程序,
      ...生成API列表命令.参数,
    ),
    公开: false,
  },
  'watch:api-type': {
    说明: '持续生成 API 接口类型',
    环境变量: 生成调试环境,
    运行: 命令(
      'tsx',
      'scripts/watch/watch.ts',
      './src/interface/',
      '--',
      生成API类型命令.程序,
      ...生成API类型命令.参数,
    ),
    公开: false,
  },
  'watch:web-index': {
    说明: '持续生成 Web 组件索引',
    环境变量: 生成调试环境,
    运行: 命令(
      'tsx',
      'scripts/watch/watch.ts',
      './src/web/components/',
      '--',
      生成Web索引命令.程序,
      ...生成Web索引命令.参数,
    ),
    公开: false,
  },
  'watch:local-api-list': {
    说明: '持续生成纯前端本地 API 列表',
    环境变量: 生成调试环境,
    运行: 命令(
      'tsx',
      'scripts/watch/watch.ts',
      './src/interface/',
      '--',
      生成本地API列表命令.程序,
      ...生成本地API列表命令.参数,
    ),
    公开: false,
  },
  'watch:local-schema': {
    说明: '持续生成纯前端数据库 Schema',
    环境变量: 生成调试环境,
    运行: 命令('tsx', 'scripts/watch/watch.ts', './prisma/', '--', 生成本地Schema命令.程序, ...生成本地Schema命令.参数),
    公开: false,
  },
  'dev:web:watch': {
    说明: '并行运行 Web 开发服务与监听任务',
    依赖方式: '并行',
    依赖: [
      'watch:type',
      'watch:lint',
      'watch:api-list',
      'watch:api-type',
      'watch:web-index',
      'run:service:dev',
      'run:web:dev',
    ],
    公开: false,
  },
  'dev:web': { 说明: '生成派生文件后启动 Web 开发套件', 依赖: ['generate', 'dev:web:watch'] },
  'dev:electron:watch': {
    说明: '并行运行 Electron 开发服务与监听任务',
    依赖方式: '并行',
    依赖: [
      'watch:type',
      'watch:lint',
      'watch:api-list',
      'watch:api-type',
      'watch:web-index',
      'run:electron:dev',
      'run:web:dev',
    ],
    公开: false,
  },
  'dev:electron': { 说明: '生成派生文件后启动 Electron 开发套件', 依赖: ['generate', 'dev:electron:watch'] },
  'dev:pure-frontend:watch': {
    说明: '并行运行纯前端开发服务与监听任务',
    依赖方式: '并行',
    依赖: [
      'watch:type',
      'watch:lint',
      'watch:api-list',
      'watch:api-type',
      'watch:web-index',
      'watch:local-api-list',
      'watch:local-schema',
      'run:pure-frontend:dev',
    ],
    公开: false,
  },
  'dev:pure-frontend': { 说明: '生成派生文件后启动纯前端开发套件', 依赖: ['generate', 'dev:pure-frontend:watch'] },

  'test:unit': {
    说明: '交互式运行单元测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    依赖: ['db:ensure:test:web'],
    运行: 命令('tsx', 'scripts/test/run-test.ts'),
    传递参数: true,
  },
  'test:unit:all': {
    说明: '非交互运行全部单元测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    依赖: ['db:ensure:test:web'],
    运行: [命令('lsby-net-core-gen-test', ...获得单元测试生成参数()), 命令('vitest', 'run')],
    传递参数: true,
  },
  'test:integration': {
    说明: '交互式运行集成测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    依赖: ['db:ensure:test:web'],
    运行: 命令('tsx', 'scripts/test/run-integration.ts'),
    传递参数: true,
  },
  'test:e2e:server': {
    说明: '构建并启动端到端测试服务',
    环境文件: 测试环境文件,
    依赖: ['db:ensure:test:web', 'build:web:test'],
    运行: 命令('tsx', './src/server.ts'),
    公开: false,
  },
  'test:e2e': {
    说明: '交互式运行端到端测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    运行: 命令('tsx', 'scripts/test/run-e2e.ts'),
    传递参数: true,
  },

  'release:verify': { 说明: '发布前运行单元测试并完成构建', 依赖: ['test:unit:all', 'build:all'], 公开: false },

  'capacitor:init': { 说明: '初始化 Capacitor', 运行: 命令('cap', 'init'), 传递参数: true },
  'capacitor:add:android': { 说明: '添加 Android 平台', 运行: 命令('cap', 'add', 'android'), 传递参数: true },
  'capacitor:sync:android': { 说明: '同步 Android 平台', 运行: 命令('cap', 'sync', 'android'), 传递参数: true },
  'capacitor:open:android': { 说明: '打开 Android 工程', 运行: 命令('cap', 'open', 'android'), 传递参数: true },

  'public:docker:local': {
    说明: '执行本地 Docker 发布',
    运行: 命令('tsx', 'scripts/public/release-docker-local.ts'),
    传递参数: true,
  },
  'public:docker:remote': {
    说明: '执行远程 Docker 发布',
    运行: 命令('tsx', 'scripts/public/release-docker-remote.ts'),
    传递参数: true,
  },
  'public:electron': {
    说明: '构建 Electron 发布包',
    环境文件: Electron生产环境文件,
    依赖: ['release:verify', 'db:push:prod:electron'],
    运行: 命令('tsx', 'scripts/public/release-electron.ts'),
    传递参数: true,
  },
  'public:npm': {
    说明: '构建并发布 NPM 包',
    环境文件: Web生产环境文件,
    依赖: ['release:verify', 'db:push:prod:web'],
    运行: 命令('tsx', 'scripts/public/release-npm.ts'),
    传递参数: true,
  },
  'public:sea': {
    说明: '构建 SEA 发布包',
    环境文件: Sea生产环境文件,
    依赖: ['release:verify', 'db:push:prod:sea'],
    运行: 命令('tsx', 'scripts/public/release-sea.ts'),
    传递参数: true,
  },
  'public:web:pure-frontend': {
    说明: '构建纯前端发布目录',
    环境文件: 纯前端生产环境文件,
    依赖: ['build:web:pure-frontend'],
    运行: 命令('tsx', 'scripts/public/release-pure-frontend.ts'),
    传递参数: true,
  },
  'release:version': {
    说明: '交互式选择新版本号',
    运行: 命令('bumpp', '--no-commit', '--no-tag', '--no-push'),
    公开: false,
  },
  release: {
    说明: '构建、提交、打标签并推送新版本',
    环境文件: Web生产环境文件,
    依赖: ['release:version', 'release:verify'],
    运行: 命令('tsx', 'scripts/release/release.ts'),
  },
})
