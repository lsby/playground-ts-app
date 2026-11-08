import { 测试环境文件, 测试调试环境 } from '../model/task-common'
import { 命令, 定义任务 } from '../model/task-runner'
import { 准备集成测试参数 } from '../prepare/test-integration'
import { 准备需求测试参数 } from '../prepare/test-requirement'
import { 准备单元测试参数 } from '../prepare/test-unit'

export let 测试任务表 = 定义任务({
  // 单元测试
  'test:unit': {
    说明: '运行单元测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    依赖: ['db:ensure:test:web'],
    准备运行: 准备单元测试参数,
    运行: 命令('tsx', 'scripts/test/unit/run-test.ts'),
    传递参数: true,
  },

  // 集成测试
  'test:integration': {
    说明: '运行集成测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    依赖: ['db:ensure:test:web'],
    准备运行: 准备集成测试参数,
    运行: 命令('tsx', 'scripts/test/integration/run-integration.ts'),
    传递参数: true,
  },

  // 业务需求测试
  'test:requirement:reset': {
    说明: '清空并初始化需求流程使用的测试数据库',
    环境文件: 测试环境文件,
    运行: 命令('tsx', 'scripts/test/requirement/reset-database.ts'),
    公开: false,
  },
  'test:requirement:server': {
    说明: '启动需求测试服务',
    环境文件: 测试环境文件,
    运行: 命令('tsx', './src/server.ts'),
    公开: false,
  },
  'test:requirement': {
    说明: '运行需求测试（含浏览器端到端流程）',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    准备运行: 准备需求测试参数,
    运行: 命令('tsx', 'scripts/test/requirement/run-requirement.ts'),
    传递参数: true,
  },
})
