import {
  Electron生产环境文件,
  Sea生产环境文件,
  Web开发环境文件,
  Web生产环境文件,
  测试环境文件,
} from '../model/task-common'
import { 命令, 定义任务 } from '../model/task-runner'

export let 数据库任务表 = 定义任务({
  // 数据库
  'db:push:dev:web': {
    说明: '初始化或迁移 Web 开发数据库并生成类型',
    环境文件: Web开发环境文件,
    运行: 命令('tsx', 'scripts/db/push-dev.ts'),
  },
  'db:migrate:create:dev:web': {
    说明: '仅生成 Web 开发数据库 migration，供检查或手工调整 SQL',
    环境文件: Web开发环境文件,
    运行: 命令('prisma', 'migrate', 'dev', '--create-only'),
    传递参数: true,
  },
  'db:migrate:deploy:dev:web': {
    说明: '为 Web 开发数据库应用已有 migration',
    环境文件: Web开发环境文件,
    运行: 命令('prisma', 'migrate', 'deploy'),
    公开: false,
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
})
