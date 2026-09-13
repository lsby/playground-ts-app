export type Node环境 = 'development' | 'production' | 'test'
export type 环境文件信息 = { 示例文件: string; 本地文件: string }

export let Node环境组: Node环境[]
export function 读取Node环境(文件路径: string): Node环境
export function 发现环境文件(项目根目录: string): 环境文件信息[]
