import { 测试环境文件, 测试调试环境 } from './task-common'
import { 命令, 定义任务 } from './task-runner'

export let 测试任务表 = 定义任务({
  // 单元测试
  'test:unit:auto': {
    说明: '运行单元测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    依赖: ['db:ensure:test:web'],
    运行: 命令('tsx', 'scripts/test/run-test.ts'),
    传递参数: true,
  },

  // 集成测试
  'test:integration:auto': {
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
  'test:e2e:auto': {
    说明: '全自动运行端到端测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    运行: 命令('tsx', 'scripts/test/run-e2e.ts', '--mode', 'auto'),
    传递参数: true,
  },
  'test:e2e:demo': {
    说明: '演示模式运行端到端测试',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    运行: 命令('tsx', 'scripts/test/run-e2e.ts', '--mode', 'demo'),
    传递参数: true,
  },

  // 业务需求测试
  'test:requirement:coverage': {
    说明: '校验业务需求、验收点与流程的覆盖关系',
    环境文件: 测试环境文件,
    运行: 命令('tsx', 'scripts/test/check-requirement-coverage.ts'),
  },
  'test:requirement:auto': {
    说明: '全自动运行业务需求流程',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    依赖: ['test:requirement:coverage'],
    运行: 命令('tsx', 'scripts/test/run-requirement.ts', '--mode', 'auto'),
    传递参数: true,
  },
  'test:requirement:demo': {
    说明: '演示模式运行业务需求流程',
    环境文件: 测试环境文件,
    环境变量: 测试调试环境,
    依赖: ['test:requirement:coverage'],
    运行: 命令('tsx', 'scripts/test/run-requirement.ts', '--mode', 'demo'),
    传递参数: true,
  },
})
