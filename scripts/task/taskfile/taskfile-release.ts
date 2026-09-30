import { Electron生产环境文件, Sea生产环境文件, Web生产环境文件, 纯前端生产环境文件 } from '../model/task-common'
import { 命令, 定义任务 } from '../model/task-runner'

export let 发布任务表 = 定义任务({
  // capacitor
  'capacitor:init': { 说明: '初始化 Capacitor', 运行: 命令('cap', 'init'), 传递参数: true },
  'capacitor:add:android': { 说明: '添加 Android 平台', 运行: 命令('cap', 'add', 'android'), 传递参数: true },
  'capacitor:sync:android': {
    说明: '构建并同步 Android 平台',
    依赖: ['build:web'],
    需要环境文件: true,
    运行: [命令('tsx', 'scripts/web/check-android-web-assets.ts'), 命令('cap', 'sync', 'android')],
    传递参数: true,
  },
  'capacitor:open:android': { 说明: '打开 Android 工程', 运行: 命令('cap', 'open', 'android'), 传递参数: true },

  // 发行
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
    依赖: ['build:all', 'db:push:prod:electron'],
    运行: 命令('tsx', 'scripts/public/release-electron.ts'),
    传递参数: true,
  },
  'public:npm': {
    说明: '构建并发布 NPM 包',
    环境文件: Web生产环境文件,
    依赖: ['build:all', 'db:push:prod:web'],
    运行: 命令('tsx', 'scripts/public/release-npm.ts'),
    传递参数: true,
  },
  'public:sea': {
    说明: '构建 SEA 发布包',
    环境文件: Sea生产环境文件,
    依赖: ['build:all', 'db:push:prod:sea'],
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

  // 发布
  'release:verify': { 说明: '发布前运行单元测试并完成构建', 依赖: ['test:unit', 'build:all'], 公开: false },
  'release:version': {
    说明: '交互式选择新版本号',
    运行: 命令('bumpp', '--no-commit', '--no-tag', '--no-push'),
    公开: false,
  },
  'release:all': {
    说明: '构建、提交、打标签并推送新版本',
    环境文件: Web生产环境文件,
    依赖: ['release:version', 'release:verify'],
    运行: 命令('tsx', 'scripts/release/release.ts'),
  },
  'release:push': {
    说明: '推送当前的发布提交与版本标签到远程仓库',
    运行: [命令('git', 'push'), 命令('git', 'push', '--tags')],
  },
})
