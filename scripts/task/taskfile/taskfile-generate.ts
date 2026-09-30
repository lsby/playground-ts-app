import {
  完整调试环境,
  生成API列表命令,
  生成API类型命令,
  生成Web页面入口命令,
  生成本地API列表命令,
  生成本地Schema命令,
} from '../model/task-common'
import { 命令, 定义任务 } from '../model/task-runner'

export let 生成任务表 = 定义任务({
  // 生成
  'generate:db-type': {
    说明: '生成 Kysely 数据库类型',
    运行: 命令('prisma', 'generate'),
    环境变量: { DB_PATH_PRISMA: 'file:./db/generate-types.db' },
    公开: false,
  },
  'generate:api-list': { 说明: '生成 API 接口列表', 运行: 生成API列表命令, 环境变量: 完整调试环境, 公开: false },
  'generate:api-type': { 说明: '生成 API 接口类型', 运行: 生成API类型命令, 环境变量: 完整调试环境, 公开: false },
  'generate:web-page-entry': { 说明: '生成 Web 页面精确入口', 运行: 生成Web页面入口命令, 公开: false },
  'generate:local-api-list': { 说明: '生成纯前端本地 API 列表', 运行: 生成本地API列表命令, 公开: false },
  'generate:local-schema': { 说明: '生成纯前端本地数据库 Schema', 运行: 生成本地Schema命令, 公开: false },
  'generate:meta': { 说明: '生成应用元信息', 运行: 命令('tsx', 'scripts/gen/gen-meta-info.ts'), 公开: false },
  'generate:all': {
    说明: '生成全部派生文件',
    依赖: [
      'generate:db-type',
      'generate:api-list',
      'generate:api-type',
      'generate:web-page-entry',
      'generate:local-api-list',
      'generate:local-schema',
      'generate:meta',
    ],
  },
})
