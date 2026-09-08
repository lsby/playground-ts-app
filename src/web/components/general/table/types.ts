import { 增强样式类型 } from '../../../global/types/style'

export type 数据表行键 = string | number

export type 数据表列配置<数据项> = {
  字段名: keyof 数据项
  显示名: string
  格式化?: (值: unknown) => string
  可排序?: boolean
  可筛选?: boolean
  列最小宽度?: string
  列最大宽度?: string
  渲染函数?: (值: unknown, 行: 数据项) => Node | string
}

export type 数据表操作配置<数据项> = { 名称: string; 回调: (数据项: 数据项) => void | Promise<void> }
export type 顶部操作配置 = { 名称: string; 回调: () => void | Promise<void> }

export type 数据表加载数据参数<数据项> = {
  页码: number
  每页数量: number
  排序列表: { field: keyof 数据项; direction: 'asc' | 'desc' }[]
  筛选条件: Record<string, string>
  信号: AbortSignal
}

export type 数据表格选项<数据项> = {
  行键: (数据项: 数据项, 索引: number) => 数据表行键
  列配置: 数据表列配置<数据项>[]
  操作列表?: 数据表操作配置<数据项>[]
  顶部操作列表?: 顶部操作配置[]
  每页数量?: number
  列最小宽度?: string
  列最大宽度?: string
  宿主样式?: 增强样式类型
  加载数据: (参数: 数据表加载数据参数<数据项>) => Promise<{ 数据: 数据项[]; 总数: number }>
}

export type 发出事件类型<数据项> = {
  操作点击: { 操作名: string; 数据项: 数据项 }
  页码变化: { 页码: number }
  加载状态变化: { 加载中: boolean; 错误: string | null }
}
export type 监听事件类型 = {}
