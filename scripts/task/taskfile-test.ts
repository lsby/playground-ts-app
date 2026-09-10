import { 测试环境文件, 测试调试环境 } from './task-common'
import { 命令, 定义任务 } from './task-runner'

export let 测试任务表 = 定义任务({
  // 单元测试
  'test:unit': {
    说明: '运行单元测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    依赖: ['db:ensure:test:web'],
    运行: 命令('tsx', 'scripts/test/run-test.ts'),
    传递参数: true,
  },

  // 集成测试
  'test:integration': {
    说明: '运行集成测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    依赖: ['db:ensure:test:web'],
    运行: 命令('tsx', 'scripts/test/run-integration.ts'),
    传递参数: true,
  },

  // 端到端测试
  'test:e2e:server': {
    说明: '构建并启动端到端测试服务',
    环境文件: 测试环境文件,
    依赖: ['db:ensure:test:web', 'build:web:test'],
    运行: 命令('tsx', './src/server.ts'),
    公开: false,
  },
  'test:e2e': {
    说明: '运行端到端测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    运行: 命令('tsx', 'scripts/test/run-e2e.ts'),
    传递参数: true,
  },

  // 业务需求测试
  'test:requirement:coverage': {
    说明: '校验业务需求、验收点与流程的覆盖关系',
    环境文件: 测试环境文件,
    运行: 命令('tsx', 'scripts/test/check-requirement-coverage.ts'),
  },
  'test:requirement': {
    说明: '运行业务需求流程测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    依赖: ['test:requirement:coverage'],
    运行: 命令('tsx', 'scripts/test/run-requirement.ts'),
    传递参数: true,
  },
})
