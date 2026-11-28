import { 命令, 定义任务 } from '../model/task-runner'

export let 文件任务表 = 定义任务({
  'files:move': {
    说明: '搬移文件并更新源码和文档引用，支持 --dry-run 或 --plan',
    运行: 命令('tsx', 'scripts/move-files/index.ts', 'move'),
    传递参数: true,
  },
  'files:plan': {
    说明: '按文件名前缀生成目录整理计划',
    运行: 命令('tsx', 'scripts/move-files/index.ts', 'plan'),
    传递参数: true,
  },
})
