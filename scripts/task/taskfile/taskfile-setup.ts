import { 命令, 定义任务 } from '../model/task-runner'

export let 初始化任务表 = 定义任务({
  // 初始化
  'setup:all': {
    说明: '重新运行项目初始化向导',
    运行: 命令('node', 'scripts/setup/preinstall.mjs', '--force'),
    传递参数: true,
  },
  'env:decode': {
    说明: '生成可编辑的明文 .decode 环境文件',
    运行: 命令('tsx', 'scripts/setup/env-crypto.ts', 'decode'),
    传递参数: true,
  },
  'env:encode': {
    说明: '将 .decode 编码回正式环境文件并清理明文',
    运行: 命令('tsx', 'scripts/setup/env-crypto.ts', 'encode'),
  },
  'env:enable-encryption': { 说明: '启用项目环境文件加密', 运行: 命令('tsx', 'scripts/setup/env-crypto.ts', 'enable') },
  'env:disable-encryption': {
    说明: '将正式环境文件恢复为明文',
    运行: 命令('tsx', 'scripts/setup/env-crypto.ts', 'disable'),
  },
  'env:status': { 说明: '查看环境文件加密与待编码状态', 运行: 命令('tsx', 'scripts/setup/env-crypto.ts', 'status') },
  'setup:ports': { 说明: '扫描并分配本地端口', 运行: 命令('tsx', 'scripts/setup/init-ports.ts'), 传递参数: true },
  'setup:github-config-key': {
    说明: '配置 GitHub Actions 项目配置密钥 Secret',
    运行: 命令('tsx', 'scripts/setup/github-config-key.ts'),
    传递参数: true,
  },
  'setup:rename': { 说明: '重命名项目', 运行: 命令('tsx', 'scripts/setup/rename-project.ts') },
})
