import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'

import { 苹果测试引擎, 苹果网络中转, 计算苹果中转端口, 计算苹果应用摘要 } from '../model/ios-test'
import { 苹果测试包标记 } from '../model/ios-test/test-marker'
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
  bundleId: z.string().min(1),
  testMarker: z.literal(苹果测试包标记),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
})

/** 单次测试会话独占 iOS 模拟器，验证测试包和后端后再启动。 */
export class 需求测试苹果设备 {
  private readonly 步骤 = new AsyncLocalStorage<步骤记录>()
  private 当前设备步骤: 步骤记录 | undefined
  private 引擎: 苹果测试引擎 | undefined
  private 打开任务: Promise<苹果测试引擎> | undefined
  private 释放设备: (() => void) | undefined
  private 当前语言: 'zh-CN' | 'en-US' | undefined
  private 已关闭 = false
  private 关闭当前任务: Promise<void> | undefined
  private 关闭任务: Promise<void> | undefined

  public constructor(
    private readonly 参数: {
      项目根目录: string
      设备: string | undefined
      获得后端地址: () => string
      /** 有值表示使用热重载包，App 加载这个前端开发服务器地址 */
      热重载前端地址?: string | undefined
      /** dev:test 持有的网络中转（随开发套件启停）；没有时每次打开会话自建、关闭会话时关掉 */
      网络中转?: 苹果网络中转 | undefined
      取消信号: AbortSignal
    },
  ) {}

  public async 打开(选项: { 语言?: 'zh-CN' | 'en-US' } = {}): Promise<苹果测试引擎> {
    this.登记当前步骤()
    if (this.已关闭) throw new Error('iOS 测试设备已关闭')
    if (this.关闭当前任务 !== undefined) throw new Error('iOS 测试设备正在关闭')
    if (this.打开任务 !== undefined) {
      // 旧会话被 Appium 回收（超时、重启）时标记还留着：探测到失效就清掉旧会话再重建，否则只能杀进程
      if (this.引擎 !== undefined && (await this.引擎.会话存活()) === false) await this.关闭当前会话()
      else throw new Error('iOS 测试设备已经打开')
    }
    this.当前语言 = 选项.语言
    this.打开任务 = this.初始化(选项.语言)
    try {
      this.引擎 = await this.打开任务
      return this.引擎
    } catch (错误) {
      this.打开任务 = undefined
      throw 错误
    }
  }

  /** 已打开但会话已失效时清掉旧会话并重新打开，返回是否重建了；没打开过或会话正常返回 false。 */
  public async 确保会话可用(): Promise<boolean> {
    if (this.引擎 === undefined || (await this.引擎.会话存活()) === true) return false
    await this.关闭当前会话()
    await this.打开(this.当前语言 === undefined ? {} : { 语言: this.当前语言 })
    return true
  }

  public 获得(): 苹果测试引擎 {
    this.登记当前步骤()
    if (this.引擎 === undefined) throw new Error('iOS 测试设备尚未打开')
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
        if (需要收尾截图()) await this.采集(当前, `${范围}结束时的模拟器画面`)
        return 结果
      } catch (错误) {
        if (需要收尾截图()) await this.采集(当前, `${范围}失败时的模拟器画面`)
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
      await this.引擎?.关闭()
    } finally {
      this.引擎 = undefined
      this.打开任务 = undefined
      this.释放设备?.()
      this.释放设备 = undefined
    }
  }

  public 关闭(): Promise<void> {
    this.已关闭 = true
    this.关闭任务 ??= this.关闭当前会话()
    return this.关闭任务
  }

  private 登记当前步骤(): void {
    this.参数.取消信号.throwIfAborted()
    let 步骤 = this.步骤.getStore()
    if (步骤 === undefined || 步骤.已结束) throw new Error('iOS 测试设备只能在当前步骤内使用')
    let 根步骤 = 步骤.根步骤 ?? 步骤
    if (this.当前设备步骤 !== undefined && this.当前设备步骤 !== 根步骤)
      throw new Error('iOS 测试设备正在执行另一条操作，请等待其完成')
    this.当前设备步骤 = 根步骤
    步骤.已使用 = true
  }

  private async 采集(步骤: 步骤记录, 说明: string): Promise<void> {
    if (步骤.已使用 === false || this.引擎 === undefined || this.参数.取消信号.aborted) return
    try {
      let 图片 = await 压缩步骤截图(await this.引擎.截图())
      步骤.提交([{ 类型: '图片', 内容类型: 'image/webp', 内容: 图片.toString('base64'), 说明 }])
    } catch (错误) {
      步骤.记录错误(new Error('iOS 步骤取证失败', { cause: 错误 }))
    }
  }

  private async 初始化(语言: 'zh-CN' | 'en-US' | undefined): Promise<苹果测试引擎> {
    let { 设备, 取消信号 } = this.参数
    if (设备 === undefined) throw new Error('iOS 需求测试需要通过 --ios-device 指定模拟器 UDID')
    if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/iu.test(设备) === false)
      throw new Error('iOS 模拟器标识必须是 UDID')
    let 地址 = new URL(this.参数.获得后端地址())
    if (地址.protocol !== 'http:' || 地址.hostname !== '127.0.0.1' || 地址.port === '' || 地址.pathname !== '/')
      throw new Error('iOS 需求测试只能连接本机测试后端')
    let 热重载地址 = this.参数.热重载前端地址
    let 配置 = (await 读取移动测试配置(this.参数.项目根目录)).iOS
    if (配置 === undefined) throw new Error('项目未配置 iOS 测试能力')
    let 构建 = 热重载地址 === undefined ? 配置.标准构建 : 配置.热重载构建
    let 构建命令 = 构建.构建命令
    let 目录 = path.resolve(this.参数.项目根目录, 构建.目录)
    let 应用路径 = path.join(目录, 构建.应用文件)
    let 原始信息: string
    try {
      原始信息 = await readFile(path.join(目录, 构建.信息文件), 'utf8')
    } catch (错误) {
      if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'ENOENT')
        throw new Error(`缺少 iOS 测试构建，请先运行 ${构建命令}`, { cause: 错误 })
      throw 错误
    }
    let 解析 = 构建信息模型.safeParse(JSON.parse(原始信息))
    if (解析.success === false)
      throw new Error(`iOS 测试构建信息不符合当前框架，请重新运行 ${构建命令}`, { cause: 解析.error })
    let 信息 = 解析.data
    if (信息.bundleId !== 配置.包名) throw new Error('iOS 测试包标识与项目配置不一致')
    // 模拟器直接访问本机回环地址；测试包连的是网络中转端口，中转再转发到测试后端。
    let 中转端口 = 计算苹果中转端口(Number(地址.port))
    if (new URL(信息.apiBaseUrl).origin !== `http://127.0.0.1:${String(中转端口)}`)
      throw new Error('iOS 测试包的后端地址与当前测试服务不一致，请重新构建')
    if (
      热重载地址 !== undefined &&
      (信息.liveUrl === undefined || new URL(信息.liveUrl).origin !== new URL(热重载地址).origin)
    )
      throw new Error(`iOS 热重载包的前端地址与当前开发服务不一致，请重新运行 ${构建命令}`)
    if (热重载地址 === undefined && 信息.liveUrl !== undefined) throw new Error('iOS 测试包是热重载版，不能用于回放')
    if (计算苹果应用摘要(应用路径, 配置.摘要路径们) !== 信息.sha256)
      throw new Error('iOS 测试包与构建信息不一致，请重新构建')
    let 外部中转 = this.参数.网络中转
    if (外部中转 !== undefined && 外部中转.获得监听端口() !== 中转端口)
      throw new Error('开发套件的 iOS 网络中转端口与后端端口不一致')
    this.释放设备 = await 独占设备(设备)
    let 中转 = 外部中转 ?? new 苹果网络中转(中转端口, Number(地址.port))
    try {
      if (外部中转 === undefined) await 中转.启动()
      else 外部中转.恢复在线()
      let 引擎 = new 苹果测试引擎(
        设备,
        取消信号,
        应用路径,
        配置.获得OCR程序,
        配置,
        语言,
        中转,
        热重载地址 ?? 配置.网页来源,
        信息.sha256,
        外部中转 === undefined,
      )
      try {
        await 引擎.启动()
        await 引擎.读取窗口()
      } catch (错误) {
        await 引擎.关闭().catch((): void => {})
        throw 错误
      }
      return 引擎
    } catch (错误) {
      if (外部中转 === undefined) await 中转.关闭().catch((): void => {})
      this.释放设备()
      this.释放设备 = undefined
      throw 错误
    }
  }
}

async function 独占设备(设备: string): Promise<() => void> {
  let 锁目录 = path.join(os.tmpdir(), 'mobile-test-ios-locks')
  await mkdir(锁目录, { recursive: true })
  let 锁路径 = path.join(锁目录, `${createHash('sha256').update(设备).digest('hex')}.sqlite`)
  let { DatabaseSync } = await import('node:sqlite')
  let 锁 = new DatabaseSync(锁路径)
  try {
    锁.exec('BEGIN IMMEDIATE')
  } catch (错误) {
    锁.close()
    throw new Error(`iOS 设备正在被其他测试使用：${设备}`, { cause: 错误 })
  }
  return (): void => 锁.close()
}
