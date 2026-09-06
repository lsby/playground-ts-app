export type 端口表类型 = {
  APP_PORT: number
  WEB_PORT: number
  WEB_HMR_PORT: number
  TEST_APP_PORT: number
  TEST_WEB_PORT: number
  TEST_WEB_HMR_PORT: number
}

export let 端口键组: Array<keyof 端口表类型>
export function 读取端口状态(项目根目录: string): 端口表类型 | null
export function 推断已有端口表(项目根目录: string, 环境文件组: string[]): 端口表类型 | null
export function 生成随机端口表(): Promise<端口表类型>
export function 应用端口表(项目根目录: string, 环境文件组: string[], 端口表: 端口表类型): void
export function 写入端口状态(项目根目录: string, 端口表: 端口表类型): void
