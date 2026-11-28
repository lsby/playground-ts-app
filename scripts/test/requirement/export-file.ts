import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, link, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { format, resolveConfig } from 'prettier'

import type { 模板资源 } from './enhanced-click-code'
import { 列出模板资源, 生成需求测试代码 } from './export-operation-record'
import { 替换发布 } from './export-replace'
import { 拆分需求测试源码 } from './export-split'
import { 读取登记快照 } from './registry-snapshot'
import { 需求描述文件名, 需求流程文件名格式, 需求目录路径格式 } from './requirement-file'
import { 清理骨架, 确保需求骨架, type 骨架验收点 } from './requirement-skeleton'

type 导出参数 = Omit<Parameters<typeof 生成需求测试代码>[0], '需求模块路径' | '覆盖验收点键们' | '源码目录路径'> & {
  文件名: string
  需求目录名: string
  覆盖验收点键们?: readonly string[] | undefined
  /** 明确传 true 才允许替换同名流程文件：范围只限该流程入口文件、它的辅助目录和这次要写的图片模板。 */
  替换?: boolean | undefined
  /** 需求描述文件不存在时用来生成骨架。 */
  骨架?: { 需求名称?: string | undefined; 需求描述?: string | undefined; 验收点们?: readonly 骨架验收点[] | undefined }
}
export type 导出结果 = { 路径: string; 已生成骨架: string | undefined }
let 导出队列 = Promise.resolve()

/**
 * 把录制时为坐标点击裁的图片模板复制到需求目录的 assets/，返回新建的文件（出错时由调用方清理）。
 * 同名文件已存在且内容一样就沿用，内容不同不覆盖，报错让人处理。
 */
export async function 复制模板资源(需求目录: string, 模板们: readonly 模板资源[]): Promise<string[]> {
  let 已复制: string[] = []
  if (模板们.length > 0) await mkdir(path.join(需求目录, 'assets'), { recursive: true })
  try {
    for (let 模板 of 模板们) {
      let 目标 = path.join(需求目录, 模板.相对路径)
      try {
        await copyFile(模板.来源路径, 目标, constants.COPYFILE_EXCL)
        已复制.push(目标)
      } catch (错误) {
        if (错误 instanceof Error === false || 'code' in 错误 === false || 错误.code !== 'EEXIST') throw 错误
        if ((await readFile(目标)).equals(await readFile(模板.来源路径)) === false)
          throw new Error(`需求目录已有不同内容的图片模板 ${模板.相对路径}，请先处理再导出`, { cause: 错误 })
      }
    }
  } catch (错误) {
    for (let 资源 of 已复制) await rm(资源, { force: true })
    throw 错误
  }
  return 已复制
}

async function 获得前端目录首页(项目根目录: string): Promise<ReadonlyMap<string, string>> {
  let 页面目录 = path.join(项目根目录, 'src', 'web', 'page')
  let 首页们 = new Map<string, string>()
  for (let 项 of await readdir(页面目录, { recursive: true, withFileTypes: true })) {
    if (项.isFile() === false || 项.name !== 'index.html') continue
    let 相对目录 = path.relative(页面目录, 项.parentPath)
    if (相对目录 === '') continue
    let 路径 = `/${相对目录.split(path.sep).map(encodeURIComponent).join('/')}/`
    首页们.set(路径, `${路径}index.html`)
  }
  return 首页们
}

export function 写出需求测试(项目根目录: string, 参数: 导出参数): Promise<导出结果> {
  let 导出 = 导出队列.then(async (): Promise<导出结果> => {
    if (需求流程文件名格式.test(参数.文件名) === false) throw new Error('导出文件名必须是英文小写短横线命名的 .ts 文件')
    if (需求目录路径格式.test(参数.需求目录名) === false)
      throw new Error('需求目录必须是英文小写短横线命名的相对路径，各层用 / 分隔')
    let 需求目录 = path.join(项目根目录, 'test', 'requirement')
    for (let 目录名 of 参数.需求目录名.split('/')) {
      需求目录 = path.join(需求目录, 目录名)
      try {
        if ((await lstat(需求目录)).isDirectory() === false) throw new Error(`需求目录必须是普通目录：${需求目录}`)
      } catch (错误) {
        // 目录不存在时留给后面的骨架生成一起建；其他问题照常报错。
        if (错误 instanceof Error === false || 'code' in 错误 === false || 错误.code !== 'ENOENT') throw 错误
        break
      }
    }
    需求目录 = path.join(项目根目录, 'test', 'requirement', ...参数.需求目录名.split('/'))
    let 文件 = path.join(需求目录, 参数.文件名)
    // 需求描述文件不存在时按传入的需求名称、描述和验收点生成骨架；之后任何一步失败都把骨架一并撤掉。
    let 骨架 = await 确保需求骨架(项目根目录, 需求目录, {
      需求名称: 参数.骨架?.需求名称,
      需求描述: 参数.骨架?.需求描述,
      验收点们: 参数.骨架?.验收点们,
      引用的验收点键们: 参数.覆盖验收点键们,
      流程名称: 参数.流程名称,
    })
    try {
      return { 路径: await 写出流程文件(项目根目录, 参数, 需求目录, 文件), 已生成骨架: 骨架?.骨架文件 }
    } catch (错误) {
      if (骨架 !== undefined) await 清理骨架(骨架.新建路径们)
      throw 错误
    }
  })
  导出队列 = 导出.then(
    (): void => {},
    (): void => {},
  )
  return 导出
}

async function 写出流程文件(项目根目录: string, 参数: 导出参数, 需求目录: string, 文件: string): Promise<string> {
  // 需求描述文件和查重名都在临时子进程里读（保留 读取需求描述文件 的全部校验），常驻进程不 import test/requirement 下任何文件，
  // 否则文件被改后会悄悄沿用缓存的旧内容。调用时骨架已经生成。
  let 登记快照 = await 读取登记快照(项目根目录, path.join(需求目录, 需求描述文件名))
  let { 本需求 } = 登记快照
  let 字典键们 = 本需求.验收点键们
  let 覆盖验收点键们 = 参数.覆盖验收点键们
  if (覆盖验收点键们 === undefined) {
    if (本需求.验收点数 !== 1) throw new Error('需求包含多个验收点，必须指定覆盖的验收点键名')
    覆盖验收点键们 = 字典键们
  }
  if (覆盖验收点键们.length === 0 || new Set(覆盖验收点键们).size !== 覆盖验收点键们.length)
    throw new Error('必须指定至少一个验收点键名，且不能重复')
  for (let 键 of 覆盖验收点键们) if (字典键们.includes(键) === false) throw new Error(`需求没有验收点键「${键}」`)
  let 流程名称 = 参数.流程名称.trim()
  let 目录首页 = await 获得前端目录首页(项目根目录)
  let 源码 = 生成需求测试代码({
    ...参数,
    流程名称,
    需求模块路径: `./${需求描述文件名.slice(0, -'.ts'.length)}`,
    源码目录路径: path.relative(需求目录, path.join(项目根目录, 'src')).replaceAll('\\', '/'),
    覆盖验收点键们,
    测试地址: { ...参数.测试地址, 目录首页 },
  })
  let 流程文件 = `${参数.需求目录名}/${参数.文件名}`
  let 被替换文件 = 参数.替换 === true ? 流程文件 : undefined
  if (登记快照.流程们.some(({ 名称, 文件 }) => 名称 === 流程名称 && 文件 !== 被替换文件))
    throw new Error(`需求测试已有流程「${流程名称}」`)
  let 需求名称 = 本需求.名称
  // 原判断是对象身份：同名但不是本需求描述文件导出的那个需求对象。同一个需求描述文件只会被加载成一个对象，
  // 所以等价于：同名需求不是来自本需求目录的 index.requirement.ts（来自别的描述文件或没有描述文件都算不同定义）。
  let 本需求描述文件 = `${参数.需求目录名}/${需求描述文件名}`
  if (登记快照.需求们.some(({ 名称, 描述文件 }) => 名称 === 需求名称 && 描述文件 !== 本需求描述文件))
    throw new Error(`需求测试已有不同定义的同名需求「${需求名称}」`)
  let 格式 = await resolveConfig(文件)
  let 辅助目录 = path.join(项目根目录, 'test', 'requirement-support', 参数.需求目录名, 参数.文件名.slice(0, -3))
  let 拆分 = 拆分需求测试源码(await format(源码, { ...格式, filepath: 文件 }), 文件, 辅助目录)
  let 内容 = await format(拆分.入口, { ...格式, filepath: 文件 })
  let 辅助们 = await Promise.all(
    拆分.辅助们.map(
      async ({ 路径, 内容 }): Promise<{ 路径: string; 内容: string }> => ({
        路径,
        内容: await format(内容, { ...格式, filepath: 路径 }),
      }),
    ),
  )
  for (let 候选 of [{ 路径: 文件, 内容 }, ...辅助们])
    if (候选.内容.split('\n').length > 500)
      throw new Error(`导出文件仍超过500行：${候选.路径}。请拆分过大的初始化数据或步骤分组后再导出`)
  if (参数.替换 === true) {
    await 替换发布({
      入口文件: 文件,
      入口内容: 内容,
      辅助目录,
      辅助们,
      需求目录,
      模板们: 列出模板资源(参数.步骤组, 参数.文件名),
    })
    return 文件
  }
  let 临时文件 = `${文件}.${randomUUID()}.tmp`
  // 坐标点击没有元素定位时，录制时裁的图片模板复制到需求目录的 assets/，流程文件按相对路径引用
  let 已复制资源们: string[] = []
  try {
    for (let 辅助 of 辅助们) {
      await mkdir(path.dirname(辅助.路径), { recursive: true })
      await writeFile(辅助.路径, 辅助.内容, { encoding: 'utf8', flag: 'wx' })
      已复制资源们.push(辅助.路径)
    }
    await writeFile(临时文件, 内容, { encoding: 'utf8', flag: 'wx' })
    已复制资源们.push(...(await 复制模板资源(需求目录, 列出模板资源(参数.步骤组, 参数.文件名))))
    // 原子地发布完整文件，同名文件存在时由文件系统拒绝覆盖。
    await link(临时文件, 文件)
  } catch (错误) {
    for (let 资源 of 已复制资源们) await rm(资源, { force: true })
    if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'EEXIST')
      throw new Error(
        `已有同名的导出文件：${path.relative(项目根目录, 文件)}（或它的辅助文件）。确认要覆盖这个场景之前的导出时，传 replace: true 重新导出`,
        { cause: 错误 },
      )
    throw 错误
  } finally {
    await rm(临时文件, { force: true })
  }
  return 文件
}
