import { 命令, 定义任务 } from '../model/task-runner'

export let 外挂LFS任务表 = 定义任务({
  'external-lfs:list': {
    说明: '列出所有加密清单中的真实文件、归属目标、大小及状态',
    运行: 命令('tsx', 'scripts/external-lfs/index.ts', 'list'),
    传递参数: true,
  },
  'external-lfs:status': {
    说明: '比较管辖文件、加密清单和云存储对象状态',
    运行: 命令('tsx', 'scripts/external-lfs/index.ts', 'status'),
    传递参数: true,
  },
  'external-lfs:push': {
    说明: '加密并上传本地变化，随后更新逐文件加密清单',
    运行: 命令('tsx', 'scripts/external-lfs/index.ts', 'push'),
    传递参数: true,
  },
  'external-lfs:pull': {
    说明: '按清单中的云存储精确版本拉取并解密缺失或变化文件',
    运行: 命令('tsx', 'scripts/external-lfs/index.ts', 'pull'),
    传递参数: true,
  },
  'external-lfs:verify': {
    说明: '下载、解密并逐个校验所有管辖对象',
    运行: 命令('tsx', 'scripts/external-lfs/index.ts', 'verify'),
    传递参数: true,
  },
})
