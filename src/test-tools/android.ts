import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'

import { 安卓测试引擎, 执行ADB, type 安卓启动选项 } from '../model/android-test'
import type { 提交步骤附件 } from '../model/test-requirement'
import { 压缩步骤截图 } from './evidence-image'
import { 读取移动测试配置 } from './mobile-config'

type 步骤记录 = {
  根步骤: 步骤记录 | undefined
  已使用: boolean
  已结束: boolean
  提交: 提交步骤附件
  记录错误: (错误: unknown) => void
}

let 构建信息模型 = z.object({
  apiBaseUrl: z.string().url(),
  liveUrl: z.string().url().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
})

/** 单次测试会话独占手机，验证测试包和后端后再启动。 */
export class 需求测试安卓设备 {
  private readonly 步骤 = new AsyncLocalStorage<步骤记录>()
  private 当前设备步骤: 步骤记录 | undefined
  private 引擎: 安卓测试引擎 | undefined
  private 打开任务: Promise<安卓测试引擎> | undefined
  private 释放设备: (() => void) | undefined
  private 反向端口们: string[] = []
  private 已关闭 = false
  private 关闭当前任务: Promise<void> | undefined
  private 关闭任务: Promise<void> | undefined

  public constructor(
    private readonly 参数: {
      项目根目录: string
      设备: string | undefined
      获得后端地址: () => string
      热重载?: { 前端地址: string; HMR端口: number } | undefined
      取消信号: AbortSignal
    },
  ) {}

  public async 打开(选项: 安卓启动选项 = {}): Promise<安卓测试引擎> {
    this.登记当前步骤()
    if (this.已关闭) throw new Error('Android 测试设备已关闭')
    if (this.关闭当前任务 !== undefined) throw new Error('Android 测试设备正在关闭')
    if (this.打开任务 !== undefined) throw new Error('Android 测试设备已经打开')
    this.打开任务 = this.初始化(选项)
    try {
      this.引擎 = await this.打开任务
      return this.引擎
    } catch (错误) {
      this.打开任务 = undefined
      throw 错误
    }
  }

  public 获得(): 安卓测试引擎 {
    this.登记当前步骤()
    if (this.引擎 === undefined) throw new Error('Android 测试设备尚未打开')
    return this.引擎
  }

  public async 执行步骤<T>(
    提交: 提交步骤附件,
    记录错误: (错误: unknown) => void,
    执行: () => Promise<T>,
    范围: '步骤' | '操作' = '步骤',
    需要收尾截图: () => boolean = (): boolean => true,
  ): Promise<T> {
    let 父步骤 = this.步骤.getStore()
    let 当前: 步骤记录 = { 根步骤: 父步骤?.根步骤 ?? 父步骤, 已使用: false, 已结束: false, 提交, 记录错误 }
    return await this.步骤.run(当前, async (): Promise<T> => {
      try {
        let 结果 = await 执行()
        if (需要收尾截图()) await this.采集(当前, `${范围}结束时的手机画面`)
        return 结果
      } catch (错误) {
        if (需要收尾截图()) await this.采集(当前, `${范围}失败时的手机画面`)
        throw 错误
      } finally {
        当前.已结束 = true
        if (this.当前设备步骤 === 当前) this.当前设备步骤 = undefined
      }
    })
  }

  public 关闭当前会话(): Promise<void> {
    this.关闭当前任务 ??= this.清理当前会话().finally((): void => {
      this.关闭当前任务 = undefined
    })
    return this.关闭当前任务
  }

  private async 清理当前会话(): Promise<void> {
    try {
      if (this.打开任务 !== undefined) await this.打开任务.catch((): void => {})
      let 设备 = this.参数.设备
      if (设备 === undefined && this.反向端口们.length > 0) throw new Error('缺少 Android 设备序号，无法移除转发')
      let 结果们 = await Promise.allSettled([
        this.引擎?.关闭().catch((错误: unknown): never => {
          throw new Error(`关闭 Android 测试引擎失败（设备 ${String(设备)}）`, { cause: 错误 })
        }),
        ...(设备 === undefined ? [] : this.反向端口们.map((端口) => this.移除反向端口(设备, 端口))),
      ])
      let 错误们 = 结果们.filter((结果) => 结果.status === 'rejected').map((结果) => 结果.reason)
      if (错误们.length > 0) throw new AggregateError(错误们, '关闭 Android 测试会话失败')
    } finally {
      this.引擎 = undefined
      this.打开任务 = undefined
      this.反向端口们 = []
      this.释放设备?.()
      this.释放设备 = undefined
    }
  }

  public 关闭(): Promise<void> {
    this.已关闭 = true
    this.关闭任务 ??= this.关闭当前会话()
    return this.关闭任务
  }

  private async 移除反向端口(设备: string, 端口: string): Promise<void> {
    try {
      await 执行ADB(['-s', 设备, 'reverse', '--remove', 端口], AbortSignal.timeout(5_000))
    } catch (错误) {
      throw new Error(`移除 Android 反向转发失败（adb -s ${设备} reverse --remove ${端口}）`, { cause: 错误 })
    }
  }

  private 登记当前步骤(): void {
    this.参数.取消信号.throwIfAborted()
    let 步骤 = this.步骤.getStore()
    if (步骤 === undefined || 步骤.已结束) throw new Error('Android 测试设备只能在当前步骤内使用')
    let 根步骤 = 步骤.根步骤 ?? 步骤
    if (this.当前设备步骤 !== undefined && this.当前设备步骤 !== 根步骤)
      throw new Error('Android 测试设备正在执行另一条操作，请等待其完成')
    this.当前设备步骤 = 根步骤
    步骤.已使用 = true
  }

  private async 采集(步骤: 步骤记录, 说明: string): Promise<void> {
    if (步骤.已使用 === false || this.引擎 === undefined || this.参数.取消信号.aborted) return
    try {
      let 图片 = await 压缩步骤截图(await this.引擎.截图())
      步骤.提交([{ 类型: '图片', 内容类型: 'image/webp', 内容: 图片.toString('base64'), 说明 }])
    } catch (错误) {
      步骤.记录错误(new Error('Android 步骤取证失败', { cause: 错误 }))
    }
  }

  private async 初始化(选项: 安卓启动选项): Promise<安卓测试引擎> {
    let { 设备, 取消信号 } = this.参数
    if (设备 === undefined) throw new Error('Android 需求测试需要通过 --device 指定设备序号')
    if (/^[A-Za-z0-9][A-Za-z0-9._:[\]-]*$/u.test(设备) === false) throw new Error('Android 设备序号无效')
    let 地址 = new URL(this.参数.获得后端地址())
    if (地址.protocol !== 'http:' || 地址.hostname !== '127.0.0.1' || 地址.port === '' || 地址.pathname !== '/')
      throw new Error('Android 需求测试只能连接本机测试后端')
    let 热重载 = this.参数.热重载
    let 前端地址: URL | undefined
    if (热重载 !== undefined) {
      前端地址 = new URL(热重载.前端地址)
      if (
        /^http:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]+)?\/?$/iu.test(热重载.前端地址) === false ||
        前端地址.protocol !== 'http:' ||
        (前端地址.hostname !== 'localhost' && 前端地址.hostname !== '127.0.0.1') ||
        前端地址.pathname !== '/' ||
        前端地址.search !== '' ||
        前端地址.hash !== '' ||
        前端地址.username !== '' ||
        前端地址.password !== ''
      )
        throw new Error('Android 热重载只能连接本机前端地址，且地址不能包含路径、查询参数或片段')
      if (Number.isSafeInteger(热重载.HMR端口) === false || 热重载.HMR端口 <= 0 || 热重载.HMR端口 > 65535)
        throw new Error('Android 热重载 HMR 端口必须是 1 到 65535 之间的整数')
    }
    let 配置 = (await 读取移动测试配置(this.参数.项目根目录)).Android
    if (配置 === undefined) throw new Error('项目未配置 Android 测试能力')
    let 构建 = 热重载 === undefined ? 配置.标准构建 : 配置.热重载构建
    let 构建命令 = 构建.构建命令
    let 目录 = path.resolve(this.参数.项目根目录, 构建.目录)
    let 信息路径 = path.join(目录, 构建.信息文件)
    let APK路径 = path.join(目录, 构建.应用文件)
    let 原始信息: string
    try {
      原始信息 = await readFile(信息路径, 'utf8')
    } catch (错误) {
      if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'ENOENT')
        throw new Error(`缺少 Android 测试构建，请先运行 ${构建命令}`, { cause: 错误 })
      throw 错误
    }
    let 信息 = 构建信息模型.parse(JSON.parse(原始信息))
    if (new URL(信息.apiBaseUrl).origin !== 地址.origin) throw new Error('Android 测试包的后端地址与当前测试服务不一致')
    if (前端地址 !== undefined && (信息.liveUrl === undefined || new URL(信息.liveUrl).origin !== 前端地址.origin))
      throw new Error(`Android 热重载包的前端地址与当前开发服务不一致，请重新运行 ${构建命令}`)
    if (前端地址 === undefined && 信息.liveUrl !== undefined) throw new Error('Android 测试包是热重载版，不能用于回放')
    let APK内容: Buffer
    try {
      APK内容 = await readFile(APK路径)
    } catch (错误) {
      if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'ENOENT')
        throw new Error(`缺少 Android 测试包 ${APK路径}，请先运行 ${构建命令}`, { cause: 错误 })
      throw 错误
    }
    let APK摘要 = createHash('sha256').update(APK内容).digest('hex')
    if (APK摘要 !== 信息.sha256) throw new Error('Android 测试包与构建信息不一致，请重新构建')
    let 状态 = (await 执行ADB(['-s', 设备, 'get-state'], 取消信号)).toString('utf8').trim()
    if (状态 !== 'device') throw new Error(`Android 设备不可用：${设备}（${状态}）`)
    let 硬件序号 = (await 执行ADB(['-s', 设备, 'shell', 'getprop', 'ro.serialno'], 取消信号)).toString('utf8').trim()
    if (硬件序号 === '' || 硬件序号 === 'unknown') throw new Error('Android 设备未提供硬件序号，无法独占')
    this.释放设备 = await 独占设备(硬件序号)
    try {
      let 路径输出 = (await 执行ADB(['-s', 设备, 'shell', 'pm', 'path', 配置.包名], 取消信号)).toString('utf8').trim()
      let 路径 = /^package:(\/data\/app\/[\w.@+=~/-]+\/base\.apk)$/u.exec(路径输出)?.[1]
      if (路径 === undefined)
        throw new Error(
          `手机没有安装可验证的 Android 本地测试包，请运行 adb -s ${设备} install -r "${APK路径}"；缺少构建时运行 ${构建命令}`,
        )
      let 摘要输出 = (await 执行ADB(['-s', 设备, 'shell', 'sha256sum', 路径], 取消信号)).toString('utf8').trim()
      let 设备摘要 = /^([a-fA-F0-9]{64})\s/u.exec(摘要输出)?.[1]
      if (设备摘要?.toLowerCase() !== 信息.sha256)
        throw new Error(
          `手机上的 Android 本地测试包与当前测试构建不一致，请运行 adb -s ${设备} install -r "${APK路径}"；需要重新构建时运行 ${构建命令}`,
        )
      let 端口们 = new Set([Number(地址.port)])
      if (前端地址 !== undefined && 热重载 !== undefined) {
        端口们.add(前端地址.port === '' ? 80 : Number(前端地址.port))
        端口们.add(热重载.HMR端口)
      }
      for (let 端口号 of 端口们) {
        let 端口 = `tcp:${String(端口号)}`
        await 执行ADB(['-s', 设备, 'reverse', '--no-rebind', 端口, 端口], 取消信号)
        this.反向端口们.push(端口)
      }
      let 引擎 = new 安卓测试引擎(设备, 取消信号, 配置.获得OCR程序, {
        包名: 配置.包名,
        启动组件: 配置.启动组件,
        网页来源: 前端地址?.origin ?? 配置.网页来源,
      })
      await 引擎.启动(选项)
      return 引擎
    } catch (错误) {
      let 清理结果们 = await Promise.allSettled(this.反向端口们.map((端口) => this.移除反向端口(设备, 端口)))
      this.反向端口们 = []
      this.释放设备()
      this.释放设备 = undefined
      let 清理错误们: unknown[] = 清理结果们.filter((结果) => 结果.status === 'rejected').map((结果) => 结果.reason)
      if (清理错误们.length > 0) throw new AggregateError([错误, ...清理错误们], 'Android 测试设备启动和清理均失败')
      throw 错误
    }
  }
}

async function 独占设备(设备: string): Promise<() => void> {
  let 锁目录 = path.join(os.tmpdir(), 'mobile-test-android-locks')
  await mkdir(锁目录, { recursive: true })
  let 锁路径 = path.join(锁目录, `${createHash('sha256').update(设备).digest('hex')}.sqlite`)
  let { DatabaseSync } = await import('node:sqlite')
  let 锁 = new DatabaseSync(锁路径)
  try {
    锁.exec('BEGIN IMMEDIATE')
  } catch (错误) {
    锁.close()
    throw new Error(`Android 设备正在被其他测试使用：${设备}`, { cause: 错误 })
  }
  return (): void => 锁.close()
}
