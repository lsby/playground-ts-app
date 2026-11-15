import { access } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

import { Appium配置模型 } from '../model/ios-test/appium-dir'

let 构建模型 = z
  .object({
    目录: z.string().min(1),
    应用文件: z.string().min(1),
    信息文件: z.string().min(1),
    构建命令: z.string().min(1),
  })
  .strict()
let 共同模型 = z.object({
  包名: z.string().regex(/^[A-Za-z][A-Za-z0-9_.]+$/u),
  网页来源: z.string().url(),
  标准构建: 构建模型,
  热重载构建: 构建模型,
  获得OCR程序: z
    .function()
    .args()
    .returns(z.promise(z.string().min(1))),
})
export let 移动测试配置模型 = z
  .object({
    Android: 共同模型
      .extend({ 启动组件: z.string().min(1) })
      .strict()
      .optional(),
    iOS: 共同模型
      .extend({
        Appium: Appium配置模型,
        网页进程标识们: z.array(z.string().min(1)).min(1),
        摘要路径们: z.array(z.string().min(1)).min(1),
        启动前: z.function().args(z.string(), z.instanceof(AbortSignal)).returns(z.promise(z.void())).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
export type 移动测试配置 = z.infer<typeof 移动测试配置模型>

/** 仅在使用移动设备时加载项目配置；普通浏览器流程不要求配置移动测试。 */
export async function 读取移动测试配置(项目根目录: string): Promise<移动测试配置> {
  if (path.isAbsolute(项目根目录) === false) throw new Error('移动测试项目根目录必须是绝对路径')
  let 文件 = path.join(项目根目录, 'test/mobile-test.config.ts')
  try {
    await access(文件)
  } catch (错误) {
    if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'ENOENT')
      throw new Error(`移动测试缺少项目配置：${文件}，接入方式见 doc/framework/mobile-testing.md`, { cause: 错误 })
    throw 错误
  }
  return z.object({ default: 移动测试配置模型 }).parse(await import(pathToFileURL(文件).href)).default
}
