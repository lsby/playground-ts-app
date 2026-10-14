import { ParcelWorker基础参数, Parcel基础参数, 测试环境文件 } from '../model/task-common'
import { 命令, 定义任务 } from '../model/task-runner'

export let 构建任务表 = 定义任务({
  // 编译
  'compile:service': {
    说明: '编译服务端 TypeScript',
    运行: [命令('tsc', '--project', './tsconfig.build.json'), 命令('tsc-alias', '-p', './tsconfig.build.json', '-f')],
    公开: false,
  },

  // 打包
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
  'bundle:worker:pure-frontend': {
    说明: '构建纯前端 API Worker',
    运行: 命令('parcel', ...ParcelWorker基础参数, '--dist-dir', 'dist/src/web/worker-assets'),
    公开: false,
  },
  // 构建
  'build:post': { 说明: '执行构建后处理', 运行: 命令('tsx', 'scripts/post-build/index.ts'), 公开: false },
  'build:all': {
    说明: '生成、自愈并构建服务端和 Web',
    依赖: ['tidy:all', 'clean:all', 'compile:service', 'bundle:web', 'build:post'],
    需要环境文件: true,
  },
  'build:web': { 说明: '生成、自愈并构建普通 Web', 依赖: ['tidy:all', 'clean:web', 'bundle:web'], 需要环境文件: true },
  'build:web:no-scope-hoist': {
    说明: '生成、自愈并构建禁用 Scope Hoisting 的 Web',
    依赖: ['tidy:all', 'clean:web', 'bundle:web-no-scope-hoist'],
    需要环境文件: true,
  },
  'build:web:pure-frontend': {
    说明: '生成、自愈并构建纯前端版本',
    依赖: ['tidy:all', 'clean:web', 'bundle:worker:pure-frontend', 'bundle:web'],
    需要环境文件: true,
  },
  'build:web:test': {
    说明: '生成并构建端到端测试前端',
    环境文件: 测试环境文件,
    依赖: ['generate:all', 'clean:web-test', 'bundle:web-test'],
  },
})
