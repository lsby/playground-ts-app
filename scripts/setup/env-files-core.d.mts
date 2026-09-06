export type Node环境 = 'development' | 'production' | 'test'
export type 构建目标 = 'web' | 'electron' | 'sea' | 'pure-frontend'
export type 环境文件标识 = { NODE_ENV: Node环境; BUILD_TARGET: 构建目标 }
export type 环境文件信息 = 环境文件标识 & { 示例文件: string; 本地文件: string }
export type 本地环境文件信息 = 环境文件标识 & { 本地文件: string }

export let Node环境组: Node环境[]
export let 构建目标组: 构建目标[]
export function 读取环境文件标识(文件路径: string): 环境文件标识
export function 发现环境文件(项目根目录: string): 环境文件信息[]
export function 发现本地环境文件(项目根目录: string): 本地环境文件信息[]
export function 获得环境文件(项目根目录: string, 标识: 环境文件标识): string
