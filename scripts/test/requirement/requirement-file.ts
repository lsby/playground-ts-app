import { lstat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { z } from 'zod'

import { 需求, 验收点 } from '../../../src/model/test-requirement'

export let 需求描述文件名 = 'index.requirement.ts'
export let 需求目录名格式 = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u
export let 需求流程文件名格式 = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts$/u

let 需求描述模块模型 = z.object({
  业务需求: z.instanceof(需求),
  验收点们: z.custom<Record<string, 验收点>>(
    (值) =>
      typeof 值 === 'object' &&
      值 !== null &&
      Array.isArray(值) === false &&
      Object.entries(值).every(([键, 点]) => 键 !== '' && 点 instanceof 验收点),
    '验收点们必须是使用非空字符串键的验收点字典',
  ),
})

export async function 读取需求描述文件(文件: string): Promise<z.infer<typeof 需求描述模块模型>> {
  if ((await lstat(文件)).isFile() === false) throw new Error(`需求描述必须是普通文件：${文件}`)
  let 模块 = 需求描述模块模型.safeParse(await import(pathToFileURL(文件).href))
  if (模块.success === false) throw new Error(`需求描述文件的导出无效：${文件}`, { cause: 模块.error })
  let { 业务需求, 验收点们 } = 模块.data
  let 字典验收点们 = Object.values(验收点们)
  if (
    字典验收点们.length !== 业务需求.获得验收点们().length ||
    new Set(字典验收点们).size !== 字典验收点们.length ||
    字典验收点们.some((点) => 业务需求.包含(点) === false)
  )
    throw new Error(`需求描述文件的验收点字典必须与业务需求一一对应：${文件}`)
  return 模块.data
}
