export type 项目名称 = { 作者名: string; 项目名: string }
export type 项目重命名参数 = { 项目根目录: string; 新作者名: string; 新项目名: string }

export function 解析当前包名(项目根目录: string): 项目名称
export function 执行项目重命名(参数: 项目重命名参数): number
