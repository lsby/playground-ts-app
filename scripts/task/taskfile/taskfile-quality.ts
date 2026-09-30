import { 命令, 定义任务 } from '../model/task-runner'

export let 质量任务表 = 定义任务({
  // 检查
  'check:format': { 说明: '检查代码格式', 运行: 命令('prettier', '--check', '.'), 公开: false },
  'check:lint': { 说明: '运行 ESLint', 运行: 命令('eslint', '.'), 公开: false },
  'check:type': { 说明: '运行 TypeScript 类型检查', 运行: 命令('tsc', '--noEmit'), 公开: false },
  'check:all': { 说明: '运行全部静态检查', 依赖: ['check:format', 'check:lint', 'check:type'] },

  // 修复
  'fix:format': { 说明: '写入代码格式', 运行: 命令('prettier', '--write', '.'), 公开: false },
  'fix:lint': { 说明: '应用 ESLint 自动修复', 运行: 命令('eslint', '.', '--fix'), 公开: false },
  'fix:all': { 说明: '修复并格式化代码', 依赖: ['fix:lint', 'fix:format'] },

  // 整理
  'tidy:all': { 说明: '生成派生文件、自动修复并执行静态检查', 依赖: ['generate:all', 'fix:all', 'check:all'] },

  // 清理
  'clean:all': { 说明: '清理全部构建产物和缓存', 运行: 命令('tsx', 'scripts/clean/clean-all.ts') },
  'clean:web': { 说明: '清理 Web 构建产物和缓存', 运行: 命令('tsx', 'scripts/clean/clean-web.ts') },
  'clean:web-test': { 说明: '清理 Web 测试构建产物', 运行: 命令('tsx', 'scripts/clean/clean-web-test.ts') },
})
