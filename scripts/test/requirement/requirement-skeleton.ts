import { lstat, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { format, resolveConfig } from 'prettier'

import { 需求描述文件名 } from './requirement-file'

export type 骨架验收点 = { 键: string; 名称: string; 描述: string }
export type 需求骨架参数 = {
  需求名称: string | undefined
  需求描述: string | undefined
  /** 显式给出的验收点；没有时按导出引用的验收点键生成占位。 */
  验收点们: readonly 骨架验收点[] | undefined
  引用的验收点键们: readonly string[] | undefined
  /** 兜底：什么验收点都没给时，用这个名称生成唯一一个验收点。 */
  流程名称: string
}

function 非空(值: string | undefined, 字段: string): string {
  let 文本 = 值?.trim() ?? ''
  if (文本 === '') throw new Error(`需求描述文件不存在，要生成骨架必须提供${字段}`)
  return 文本
}

function 整理验收点们(参数: 需求骨架参数): 骨架验收点[] {
  let 来源: 骨架验收点[]
  if (参数.验收点们 !== undefined && 参数.验收点们.length > 0) {
    来源 = 参数.验收点们.map(({ 键, 名称, 描述 }) => ({
      键: 键.trim(),
      名称: 非空(名称, `验收点「${键}」的名称`),
      描述: 非空(描述, `验收点「${键}」的描述`),
    }))
  } else if (参数.引用的验收点键们 !== undefined && 参数.引用的验收点键们.length > 0) {
    来源 = 参数.引用的验收点键们.map((键) => ({
      键: 键.trim(),
      名称: 键.trim(),
      描述: '（自动生成的占位描述，请补全这项验收点要证明什么）',
    }))
  } else {
    来源 = [
      {
        键: 参数.流程名称.trim(),
        名称: 参数.流程名称.trim(),
        描述: '（自动生成的占位描述，请补全这项验收点要证明什么）',
      },
    ]
  }
  let 键们 = 来源.map(({ 键 }) => 键)
  if (键们.some((键) => 键 === '') || new Set(键们).size !== 键们.length)
    throw new Error('验收点键不能为空，也不能重复')
  return 来源
}

/** 生成需求描述文件的源码，格式与现有的 index.requirement.ts 一致。 */
export function 生成需求骨架源码(参数: 需求骨架参数, 源码目录路径: string): string {
  let 名称 = 非空(参数.需求名称, '需求名称（requirementName）')
  let 描述 = 非空(参数.需求描述, '需求描述（requirementDescription）')
  let 验收点们 = 整理验收点们(参数)
  let 字典 = 验收点们
    .map(
      ({ 键, 名称, 描述 }) =>
        `  ${JSON.stringify(键)}: new 验收点({ 名称: ${JSON.stringify(名称)}, 描述: ${JSON.stringify(描述)} }),`,
    )
    .join('\n')
  return `import { 需求, 验收点 } from '${源码目录路径}/model/test-requirement'

export let 验收点们 = {
${字典}
}

export let 业务需求 = new 需求({
  名称: ${JSON.stringify(名称)},
  描述: ${JSON.stringify(描述)},
  验收点们: Object.values(验收点们),
})
`
}

/**
 * 需求描述文件不存在时生成骨架。返回新建的文件和目录（失败时由调用方按相反顺序清理）；
 * 文件已存在返回 undefined，不覆盖。
 */
export async function 确保需求骨架(
  项目根目录: string,
  需求目录: string,
  参数: 需求骨架参数,
): Promise<{ 新建路径们: string[]; 骨架文件: string } | undefined> {
  let 文件 = path.join(需求目录, 需求描述文件名)
  try {
    await lstat(文件)
    return undefined
  } catch (错误) {
    if (错误 instanceof Error === false || 'code' in 错误 === false || 错误.code !== 'ENOENT') throw 错误
  }
  let 源码目录路径 = path.relative(需求目录, path.join(项目根目录, 'src')).replaceAll('\\', '/')
  let 源码 = 生成需求骨架源码(参数, 源码目录路径)
  let 格式 = await resolveConfig(文件)
  let 内容 = await format(源码, { ...格式, filepath: 文件 })
  let 新建路径们: string[] = []
  // 从最外层开始找出缺失的目录，失败时按相反顺序清理。
  let 缺失目录们: string[] = []
  let 当前 = 需求目录
  for (;;) {
    try {
      await lstat(当前)
      break
    } catch (错误) {
      if (错误 instanceof Error === false || 'code' in 错误 === false || 错误.code !== 'ENOENT') throw 错误
      缺失目录们.unshift(当前)
      当前 = path.dirname(当前)
    }
  }
  try {
    for (let 目录 of 缺失目录们) {
      await mkdir(目录)
      新建路径们.unshift(目录)
    }
    await writeFile(文件, 内容, { encoding: 'utf8', flag: 'wx' })
    新建路径们.unshift(文件)
  } catch (错误) {
    await 清理骨架(新建路径们)
    throw 错误
  }
  return { 新建路径们, 骨架文件: 文件 }
}

export async function 清理骨架(新建路径们: readonly string[]): Promise<void> {
  for (let 路径 of 新建路径们) await rm(路径, { recursive: true, force: true })
}
