import type { 安卓启动选项, 安卓测试引擎 } from '../android-test'
import type { 浏览器测试引擎 } from '../browser-test'
import type { JSON值 } from '../data/json-value'
import type { 苹果测试引擎 } from '../ios-test'

export type 测试数据库值 = string | number | bigint | Uint8Array | null
export type 测试数据库写入结果 = { 影响行数: number; 最后插入编号: number | bigint | undefined }
export type 测试数据库表结构 = {
  表: string
  列们: { 列: string; 类型: string; 非空: boolean; 主键序号: number; 默认值: string | null }[]
  外键们: { 列: string; 引用表: string; 引用列: string | null; 更新时: string; 删除时: string }[]
}

export type 测试服务日志内容 = { 标准输出: string; 错误输出: string }

export type 测试HTTP请求 = {
  method: 'GET' | 'POST'
  path: string
  auth?: 'test-admin' | undefined
  body?: JSON值 | undefined
  timeoutMs?: number | undefined
}

export type 测试HTTP结果 = { status: number; ok: boolean; body: JSON值 }

export type 需求测试工具 = {
  readonly 取消信号: AbortSignal
  服务地址: () => string
  浏览器: {
    打开: (名称: string, 初始地址?: string) => Promise<浏览器测试引擎>
    获得: (名称: string) => 浏览器测试引擎
    列出: () => readonly string[]
    关闭: (名称: string) => Promise<void>
  }
  Android: { 打开: (选项?: 安卓启动选项) => Promise<安卓测试引擎>; 获得: () => 安卓测试引擎 }
  iOS: {
    打开: (选项?: { 语言?: 'zh-CN' | 'en-US' }) => Promise<苹果测试引擎>
    获得: () => 苹果测试引擎
    // 已打开但会话已被 Appium 回收时清掉旧会话并重建，返回是否重建
    确保会话可用: () => Promise<boolean>
  }
  数据库: {
    查询: (语句: string, 参数?: readonly 测试数据库值[], 报告列?: readonly string[]) => Record<string, 测试数据库值>[]
    // 写入只限测试库；语句和参数必须确定（不用随机值，不用当前时间造关键数据），录制和回放才一致
    执行: (语句: string, 参数?: readonly 测试数据库值[]) => 测试数据库写入结果
    表结构: (表们?: readonly string[]) => 测试数据库表结构[]
  }
  HTTP: { 请求: (参数: 测试HTTP请求, 请求取消信号?: AbortSignal) => Promise<测试HTTP结果> }
  后端日志: { 读取: () => 测试服务日志内容 }
}
