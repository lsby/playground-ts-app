export type 密钥信息 = { 版本: 1; 密钥标识: string; 密钥: Buffer }

export let 加密开关名称: string
export let 项目密钥相对路径: string
export function 读取项目密钥(项目根目录: string): 密钥信息
export function 生成项目密钥(项目根目录: string): 密钥信息
export function 解密环境文本(参数: { 项目根目录: string; 文件路径: string; 加密内容: string }): string
export function 加密环境文本(参数: {
  项目根目录: string
  文件路径: string
  明文内容: string
  现有加密内容?: string
}): string
export function 读取环境文件明文(项目根目录: string, 文件路径: string): string
export function 发现正式环境文件(项目根目录: string): string[]
