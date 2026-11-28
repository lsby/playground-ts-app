import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { 模板资源 } from './enhanced-click-code'

type 替换参数 = {
  入口文件: string
  入口内容: string
  辅助目录: string
  辅助们: readonly { 路径: string; 内容: string }[]
  需求目录: string
  模板们: readonly 模板资源[]
}

async function 存在(路径: string): Promise<boolean> {
  try {
    await stat(路径)
    return true
  } catch (错误) {
    if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'ENOENT') return false
    throw 错误
  }
}

/**
 * 替换导出：只动这个流程的入口文件、辅助目录和这次要写的图片模板。
 * 新内容先全部写到临时位置，再逐项换上去；旧文件先改名保留，任何一步失败都按相反顺序还原，成功后才删旧文件。
 */
export async function 替换发布(参数: 替换参数): Promise<void> {
  let 标识 = randomUUID()
  let 暂存目录 = `${参数.辅助目录}.${标识}.new`
  let 临时入口 = `${参数.入口文件}.${标识}.tmp`
  let 备份们: string[] = []
  let 撤销们: (() => Promise<void>)[] = []
  // 新建的暂存文件，失败或成功后都要清理
  let 临时们 = [暂存目录, 临时入口]
  // 本次新建的目录（失败时清掉，避免留下空目录）
  let 新建目录们: string[] = []
  let 建目录 = async (目录: string): Promise<void> => {
    let 首个 = await mkdir(目录, { recursive: true })
    if (首个 !== undefined) 新建目录们.push(首个)
  }
  try {
    for (let 辅助 of 参数.辅助们) {
      let 相对 = path.relative(参数.辅助目录, 辅助.路径)
      if (相对.startsWith('..') || path.isAbsolute(相对)) throw new Error(`辅助文件不在辅助目录内：${辅助.路径}`)
      let 暂存 = path.join(暂存目录, 相对)
      await mkdir(path.dirname(暂存), { recursive: true })
      await writeFile(暂存, 辅助.内容, { encoding: 'utf8', flag: 'wx' })
    }
    await writeFile(临时入口, 参数.入口内容, { encoding: 'utf8', flag: 'wx' })

    let 换上 = async (目标: string, 新来源: string | undefined): Promise<void> => {
      let 备份 = `${目标}.${标识}.bak`
      let 有旧 = await 存在(目标)
      if (有旧) {
        await rename(目标, 备份)
        备份们.push(备份)
        撤销们.push(async (): Promise<void> => {
          await rm(目标, { recursive: true, force: true })
          await rename(备份, 目标)
        })
      }
      if (新来源 === undefined) return
      await 建目录(path.dirname(目标))
      await rename(新来源, 目标)
      撤销们.push(async (): Promise<void> => {
        await rename(目标, 新来源)
      })
    }

    if (参数.辅助们.length > 0) await 换上(参数.辅助目录, 暂存目录)
    else await 换上(参数.辅助目录, undefined)
    await 换上(参数.入口文件, 临时入口)
    for (let 模板 of 参数.模板们) {
      let 目标 = path.join(参数.需求目录, 模板.相对路径)
      let 暂存 = `${目标}.${标识}.tmp`
      临时们.push(暂存)
      await 建目录(path.dirname(目标))
      await copyFile(模板.来源路径, 暂存)
      await 换上(目标, 暂存)
    }
  } catch (错误) {
    for (let 撤销 of 撤销们.reverse()) {
      try {
        await 撤销()
      } catch (还原错误) {
        throw new Error('替换失败且还原旧文件时出错，旧文件备份保留为 *.bak，请手动处理', {
          cause: new AggregateError([错误, 还原错误]),
        })
      }
    }
    for (let 临时 of 临时们) await rm(临时, { recursive: true, force: true })
    for (let 目录 of 新建目录们) await rm(目录, { recursive: true, force: true })
    throw 错误
  }
  for (let 备份 of 备份们) await rm(备份, { recursive: true, force: true })
  for (let 临时 of 临时们) await rm(临时, { recursive: true, force: true })
}
