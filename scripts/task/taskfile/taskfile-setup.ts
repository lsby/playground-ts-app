import { 命令, 定义任务 } from '../model/task-runner'

export let 初始化任务表 = 定义任务({
  // 初始化
  'setup:all': {
    说明: '重新运行项目初始化向导',
    运行: 命令('node', 'scripts/setup/preinstall.mjs', '--force'),
    传递参数: true,
  },
  'setup:env': { 说明: '从示例初始化本地配置', 运行: 命令('tsx', 'scripts/setup/init-env.ts'), 传递参数: true },
  'setup:ports': { 说明: '扫描并分配本地端口', 运行: 命令('tsx', 'scripts/setup/init-ports.ts'), 传递参数: true },
  'setup:github-electron-env': {
    说明: '配置 Electron GitHub Actions 环境文件 Secret',
    运行: 命令('tsx', 'scripts/setup/github-electron-env.ts'),
    传递参数: true,
  },
  'setup:rename': { 说明: '重命名项目', 运行: 命令('tsx', 'scripts/setup/rename-project.ts') },
})
