import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

import { 执行Xcrun } from './simctl'

type 安装参数 = {
  设备: string
  应用路径: string
  摘要: string | undefined
  包名: string
  取消信号: AbortSignal
  常驻目录: string
}

async function 清空已安装应用数据(参数: 安装参数, 标记文件: string, 摘要: string): Promise<boolean> {
  try {
    let 标记 = z.object({ 摘要: z.string() }).parse(JSON.parse(await readFile(标记文件, 'utf8')))
    if (标记.摘要 !== 摘要) return false
    let 容器 = (await 执行Xcrun(['simctl', 'get_app_container', 参数.设备, 参数.包名, 'data'], 参数.取消信号, 30_000))
      .toString('utf8')
      .trim()
    if (path.isAbsolute(容器) === false || 容器.includes('/Containers/Data/Application/') === false) return false
    for (let 项 of await readdir(容器)) await rm(path.join(容器, 项), { recursive: true, force: true })
    // 权限授权（相册、相机等）记在系统里，不在应用容器中；一并重置，才和卸载重装一样会重新弹授权。
    await 执行Xcrun(['simctl', 'privacy', 参数.设备, 'reset', 'all', 参数.包名], 参数.取消信号, 30_000)
    return true
  } catch {
    // 没有标记、没装过或清理失败，都退回卸载重装。
    return false
  }
}

/**
 * 让模拟器里是「干净安装」的测试包：摘要和上次装的一致就只清空应用数据，不一致或没装过就卸载重装。
 * 两种做法的结果都是：包是当前构建、应用数据为空。
 */
export async function 准备测试包(参数: 安装参数): Promise<void> {
  try {
    await 执行Xcrun(['simctl', 'terminate', 参数.设备, 参数.包名], 参数.取消信号, 120_000)
  } catch {
    // 应用没在运行时 terminate 会报错，可忽略。
  }
  let 标记文件 = path.join(参数.常驻目录, `installed-${参数.设备}-${参数.包名}.json`)
  if (参数.摘要 !== undefined && (await 清空已安装应用数据(参数, 标记文件, 参数.摘要))) return
  try {
    await 执行Xcrun(['simctl', 'uninstall', 参数.设备, 参数.包名], 参数.取消信号, 120_000)
  } catch {
    // 首次没有安装过。
  }
  await rm(标记文件, { force: true })
  await 执行Xcrun(['simctl', 'install', 参数.设备, 参数.应用路径], 参数.取消信号, 120_000)
  if (参数.摘要 !== undefined) {
    await mkdir(path.dirname(标记文件), { recursive: true })
    await writeFile(标记文件, JSON.stringify({ 摘要: 参数.摘要 }))
  }
}
