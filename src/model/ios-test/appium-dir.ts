import path from 'node:path'
import { z } from 'zod'

export let Appium配置模型 = z
  .object({
    目录: z.string().min(1).refine(path.isAbsolute, 'Appium 目录必须是绝对路径'),
    驱动目录: z.string().min(1).refine(path.isAbsolute, 'Appium 驱动目录必须是绝对路径'),
    端口: z.number().int().min(1024).max(65535),
    日志级别: z.string().min(1),
  })
  .strict()
export type Appium配置 = z.infer<typeof Appium配置模型>

export function 获得Appium目录(配置: Appium配置): string {
  return 配置.目录
}
