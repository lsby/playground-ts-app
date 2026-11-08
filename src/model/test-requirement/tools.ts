import type { 浏览器测试引擎 } from '../browser-test'

export type 测试数据库值 = string | number | bigint | Uint8Array | null

export type 测试服务日志内容 = { 标准输出: string; 错误输出: string }

export type 需求测试工具 = {
  readonly 取消信号: AbortSignal
  服务地址: () => string
  浏览器: {
    打开: (名称: string, 初始地址?: string) => Promise<浏览器测试引擎>
    获得: (名称: string) => 浏览器测试引擎
    列出: () => readonly string[]
    关闭: (名称: string) => Promise<void>
  }
  数据库: {
    查询: (语句: string, 参数?: readonly 测试数据库值[], 报告列?: readonly string[]) => Record<string, 测试数据库值>[]
  }
  后端日志: { 读取: () => 测试服务日志内容 }
}
