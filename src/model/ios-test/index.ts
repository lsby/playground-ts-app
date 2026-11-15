import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as 等待 } from 'node:timers/promises'
import { promisify } from 'node:util'
import { z } from 'zod'

import type { 模板点击选项 } from '../../test-tools/template-match'
import { 寻找截图文字 } from '../android-test/ocr'
import type { 落点探测结果 } from '../web-locate/candidates'
import { Appium会话 } from './appium'
import type { Appium配置 } from './appium-dir'
import { 向焦点输入框输入, 检查点坐标 } from './input'
import { 准备测试包 } from './install'
import { 生成原生谓词 } from './native-predicate'
import type { 苹果网络中转, 苹果网络状态 } from './network-relay'
import { 解析苹果界面 } from './parse-screen'
import { 创建Appium常驻管理器 } from './resident'
import { 上下文模型, 元素标识模型, 定位结果模型, 矩形模型, 苹果目标模型 } from './schema'
import { 执行Xcrun, 设置应用语言, 读取模拟器状态 } from './simctl'
import type { 苹果界面元素, 苹果目标 } from './types'
import { 筛选网页上下文, 读取网页地址 } from './web-context'
import { 探测苹果落点, 等待苹果模板后点击, 等待苹果画面稳定, 轮询等待地址 } from './web-probe'
import { 定位脚本, 观察网页脚本 } from './web-script'

export { 计算苹果应用摘要 } from './app-digest'
export { 苹果网络中转, 计算苹果中转端口 } from './network-relay'
export type { 苹果网络状态 } from './network-relay'
export { 执行Xcrun } from './simctl'
export type { 苹果界面元素, 苹果目标 } from './types'

let PNG签名 = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
let 原生上下文 = 'NATIVE_APP'
let 执行文件 = promisify(execFile)

function 是原生目标(目标: 苹果目标): boolean {
  return 目标.按 === '文字' || 目标.按 === '描述' || 目标.按 === '标识'
}

/**
 * 通过 Appium XCUITest 驱动 iOS 模拟器里的项目测试包。
 * 网页元素在 WEBVIEW 里定位，点击则换算成屏幕坐标后在 NATIVE_APP 里发真实触摸。
 */
export class 苹果测试引擎 {
  private appium: Appium会话 | undefined
  private 当前上下文: string | undefined
  private 网页上下文: string | undefined
  private 原外观: 'light' | 'dark' | undefined
  private 是我们启动的模拟器 = false
  private 窗口缓存: z.infer<typeof 矩形模型> | undefined

  public constructor(
    private readonly 设备: string,
    private readonly 取消信号: AbortSignal,
    private readonly 应用路径: string,
    private readonly 获得OCR程序: () => Promise<string>,
    private readonly 应用配置: {
      包名: string
      网页进程标识们: readonly string[]
      Appium: Appium配置
      启动前?: ((设备: string, 信号: AbortSignal) => Promise<void>) | undefined
    },
    private readonly 应用语言: 'zh-CN' | 'en-US' | undefined,
    private readonly 网络中转: 苹果网络中转 | undefined,
    /** 热重载包的页面来自前端开发服务器，网页地址以它开头；打包版是 capacitor://localhost */
    private readonly 网页地址前缀: string,
    /** 当前测试包的摘要；和上次安装的一致时不重新安装，只清空应用数据（效果等同卸载重装） */
    private readonly 应用摘要: string | undefined,
    /** 中转由本引擎创建时，关闭会话要关掉它；由 dev:test 持有时只恢复在线，中转继续监听。 */
    private readonly 拥有网络中转: boolean,
  ) {
    if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/iu.test(设备) === false)
      throw new Error('iOS 模拟器标识必须是 UDID')
  }

  public async 启动(): Promise<void> {
    let 状态 = await 读取模拟器状态(this.设备, this.取消信号)
    if (状态 === undefined) throw new Error(`找不到 iOS 模拟器：${this.设备}`)
    if (状态 !== 'Booted') {
      await this.simctl(['boot', this.设备])
      this.是我们启动的模拟器 = true
    }
    await this.simctl(['bootstatus', this.设备, '-b'], 300_000)
    this.原外观 = z
      .enum(['light', 'dark'])
      .catch('light')
      .parse((await this.simctl(['ui', this.设备, 'appearance'])).toString('utf8').trim())
    await 准备测试包({
      设备: this.设备,
      应用路径: this.应用路径,
      摘要: this.应用摘要,
      包名: this.应用配置.包名,
      取消信号: this.取消信号,
      常驻目录: 创建Appium常驻管理器(this.应用配置.Appium).获得常驻目录(),
    })
    await this.应用配置.启动前?.(this.设备, this.取消信号)
    await 设置应用语言(this.设备, this.应用配置.包名, this.应用语言, this.取消信号)
    this.appium = await Appium会话.启动(this.取消信号, this.应用配置.Appium)
    try {
      await this.appium.创建会话(
        {
          platformName: 'iOS',
          'appium:automationName': 'XCUITest',
          'appium:udid': this.设备,
          'appium:bundleId': this.应用配置.包名,
          'appium:noReset': true,
          'appium:isHeadless': true,
          'appium:connectHardwareKeyboard': false,
          // WebDriverAgent 由 resident.ts 常驻启动，Appium 只连不管，会话结束不会关掉它
          'appium:webDriverAgentUrl': await 创建Appium常驻管理器(this.应用配置.Appium).确保WDA常驻(
            this.设备,
            this.取消信号,
          ),
          'appium:wdaConnectionTimeout': 240_000,
          // Web Inspector 进程标识由项目提供
          'appium:additionalWebviewBundleIds': [...this.应用配置.网页进程标识们],
          'appium:webviewConnectTimeout': 30_000,
          // 默认 60 秒没命令就回收会话，等 AI 生成、人工看图都会超；改成 1 小时（不用 0，避免会话泄漏到永远），
          // 真失效了由 ios_* 工具自动检测并重建（见 需求测试苹果设备.确保会话可用）
          'appium:newCommandTimeout': 3600,
        },
        900_000,
      )
      this.当前上下文 = 原生上下文
      await this.使用网页()
    } catch (错误) {
      let 日志 = this.appium.获得日志()
      await this.关闭().catch((): void => {})
      throw new Error(
        `iOS 测试应用启动失败：${错误 instanceof Error ? 错误.message : String(错误)}\nAppium 日志：${日志}`,
        { cause: 错误 },
      )
    }
  }

  public async 截图(信号: AbortSignal = this.取消信号): Promise<Buffer> {
    let 目录 = await mkdtemp(path.join(os.tmpdir(), 'mobile-test-ios-shot-'))
    try {
      let 文件 = path.join(目录, 'screen.png')
      await 执行文件('xcrun', ['simctl', 'io', this.设备, 'screenshot', '--type=png', 文件], {
        signal: AbortSignal.any([this.取消信号, 信号]),
        timeout: 30_000,
      })
      let 图片 = await readFile(文件)
      if (图片.length < 24 || 图片.subarray(0, 8).equals(PNG签名) === false) throw new Error('iOS 截图不是有效的 PNG')
      return 图片
    } finally {
      await rm(目录, { recursive: true, force: true })
    }
  }

  /** 切换模拟的网络：online 透传，offline 像飞行模式一样拒绝连接，hang 接住连接但不回复。切换时断开现存连接，杀掉重开应用时状态保持。 */
  public 设置网络(状态: 苹果网络状态): void {
    if (this.网络中转 === undefined) throw new Error('当前测试会话没有网络中转')
    this.网络中转.设置状态(状态)
  }

  public async 设置配色方案(配色方案: 'light' | 'dark'): Promise<void> {
    await this.simctl(['ui', this.设备, 'appearance', 配色方案])
  }

  public async 点击(目标: 苹果目标, 超时毫秒 = 10_000): Promise<void> {
    目标 = 苹果目标模型.parse(目标)
    this.检查超时(超时毫秒)
    if (是原生目标(目标)) {
      let 元素 = await this.等待原生(目标, 超时毫秒, '可点击', true)
      if (元素 === undefined) throw new Error('目标不存在')
      await this.点击点(Math.round(元素.x + 元素.宽 / 2), Math.round(元素.y + 元素.高 / 2))
      return
    }
    // 可点击 = 可见、中心点没被别的元素盖住、没有 disabled 或 aria-disabled；不满足就在超时内继续等
    let 可点击 = (值: z.infer<typeof 定位结果模型>): boolean => 值.数量 === 1 && 值.可点击
    let 结果 = await this.等待定位(目标, 超时毫秒, '可点击', true, 可点击)
    // 元素还在动画（弹窗滑入等）时位置会变，等连续两次定位的矩形一致再点，和 Playwright 的稳定性检查一样
    // 一直在动的元素（循环动画）等不到稳定，最多等 3 秒就按最后的位置点，和之前的行为一致
    let 稳定截止 = Date.now() + Math.min(超时毫秒, 3000)
    while (true) {
      await 等待(150, undefined, { signal: this.取消信号 })
      let 新结果 = await this.等待定位(目标, 超时毫秒, '可点击', true, 可点击)
      let 稳定 = (['x', 'y', '元素宽', '元素高'] as const).every((键) => Math.abs(新结果[键] - 结果[键]) < 1)
      结果 = 新结果
      if (稳定 || Date.now() >= 稳定截止) break
    }
    let { x, y, width, height } = await this.读取网页范围()
    await this.点击点(Math.round(x + (结果.x * width) / 结果.宽), Math.round(y + (结果.y * height) / 结果.高))
  }

  /** 点击屏幕坐标。坐标单位是「点」（逻辑像素，iPhone 17 为 402×874），不是截图像素。 */
  public async 点击坐标(x: number, y: number): Promise<void> {
    await this.点击点(x, y)
  }

  /** 读取原生无障碍树的精简列表（位置和尺寸单位是「点」）。 */
  public async 观察界面(): Promise<readonly 苹果界面元素[]> {
    await this.使用原生()
    try {
      let 源码 = z.string().parse(await this.会话().请求('GET', '/source'))
      return 解析苹果界面(源码)
    } finally {
      await this.使用网页()
    }
  }

  /** 读取 WebView 的精简无障碍快照文本。 */
  public async 观察网页(): Promise<string> {
    await this.使用网页()
    return z.string().parse(await this.会话().执行脚本(观察网页脚本))
  }

  /** 从 (x1,y1) 按住滑到 (x2,y2)，坐标单位是「点」，耗时是手指移动用的毫秒数。 */
  public async 滑动(x1: number, y1: number, x2: number, y2: number, 耗时毫秒 = 300): Promise<void> {
    if (Number.isSafeInteger(耗时毫秒) === false || 耗时毫秒 <= 0 || 耗时毫秒 > 60_000)
      throw new Error('滑动耗时必须是 1 到 60000 毫秒之间的整数')
    let 窗口 = await this.读取窗口()
    for (let [x, y] of [
      [x1, y1],
      [x2, y2],
    ] as const)
      检查点坐标(x, y, 窗口)
    await this.使用原生()
    try {
      await this.发指针动作([
        { type: 'pointerMove', duration: 0, x: x1, y: y1 },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 50 },
        { type: 'pointerMove', duration: 耗时毫秒, x: x2, y: y2 },
        { type: 'pointerUp', button: 0 },
      ])
    } finally {
      await this.使用网页()
    }
  }

  /**
   * iOS 没有返回键，用从屏幕左边缘向右滑模拟系统返回手势。
   * 只有页面或 WKWebView 响应边缘手势时才会返回，测试应用的实际情况见 doc/framework/testing.md。
   */
  public async 返回(): Promise<void> {
    let 窗口 = await this.读取窗口()
    await this.滑动(1, Math.round(窗口.height / 2), Math.round(窗口.width * 0.8), Math.round(窗口.height / 2), 300)
  }

  /** 截图后用 OCR 找到唯一匹配的文字，只返回点坐标（不点击）。录制时先认出落点元素，再点击。 */
  public async 查找截图文字(文字: string): Promise<{ x: number; y: number }> {
    let 图片 = await this.截图()
    let { x, y } = await 寻找截图文字(await this.获得OCR程序(), 图片, 文字, this.取消信号)
    let 比例 = 图片.readUInt32BE(16) / (await this.读取窗口()).width
    if (Number.isFinite(比例) === false || 比例 <= 0) throw new Error('iOS 窗口宽度无效')
    return { x: Math.round(x / 比例), y: Math.round(y / 比例) }
  }

  /** 截图后用 OCR 找到唯一匹配的文字，把像素坐标换算成点坐标，在原生层发真实触摸。 */
  public async 点击截图文字(文字: string): Promise<{ x: number; y: number }> {
    let 点 = await this.查找截图文字(文字)
    await this.点击点(点.x, 点.y)
    return 点
  }

  /**
   * 没有 DOM 可定位的点击（Canvas、原生界面）：回放时在原坐标附近用图片模板找目标，找到再点击。
   * 模板路径可以是绝对路径，也可以是相对流程文件的 URL（new URL('assets/x.png', import.meta.url)）。
   */
  public async 等待图片后点击(
    模板: string | URL,
    选项: 模板点击选项,
    超时毫秒 = 15_000,
  ): Promise<{ x: number; y: number }> {
    let 窗口宽 = (await this.读取窗口()).width
    let 点击 = (x: number, y: number): Promise<void> => this.点击点(x, y)
    return await 等待苹果模板后点击({
      模板,
      选项,
      超时毫秒,
      取消信号: this.取消信号,
      截图: () => this.截图(),
      窗口宽,
      点击,
    })
  }

  /** WebView 当前的页面地址（location.href）；整页换文档后会重新查找并切换上下文，见 读取网页地址。 */
  public async 读取地址(): Promise<string> {
    let { 地址, 上下文 } = await 读取网页地址(this.会话(), this.网页地址前缀, this.网页上下文, this.当前上下文)
    this.网页上下文 = 上下文
    this.当前上下文 = 上下文
    return 地址
  }

  /** 等页面地址的 pathname 加 hash 与目标一致（忽略 origin，热重载包和打包版通用）；超时报错并说明实际地址。 */
  public async 等待地址(目标: string, 超时毫秒 = 10_000): Promise<void> {
    await 轮询等待地址(() => this.读取地址(), 目标, 超时毫秒, this.取消信号)
  }

  /**
   * 坐标点击的落点识别：把点坐标换算成 WebView 里的 CSS 坐标，穿透 Shadow DOM 找到落点元素，
   * 生成定位并用 iOS 引擎自己的查询逻辑当场验证唯一。落在 WebView 之外（原生界面）返回无定位。
   */
  public async 探测落点(x: number, y: number): Promise<落点探测结果> {
    let 范围 = await this.读取网页范围()
    return await 探测苹果落点(this.会话(), 范围, { x, y })
  }

  /** 向当前获得焦点的输入框输入文字，走系统键盘。 */
  public async 输入(文字: string): Promise<void> {
    if (文字 === '') throw new Error('iOS 输入内容不能为空')
    await this.使用原生()
    try {
      await 向焦点输入框输入(this.会话(), 文字)
    } finally {
      await this.使用网页()
    }
  }

  /** 杀掉并重新打开 App（不卸载、不清数据），等 WebView 重新就绪再返回。 */
  /** 会话是否还能用（被 Appium 回收或进程重启后为 false）；用最轻的查询探一下。 */
  public async 会话存活(): Promise<boolean> {
    try {
      await this.会话().请求('GET', '/timeouts', undefined, 10_000)
      return true
    } catch {
      return false
    }
  }

  public async 重启应用(): Promise<void> {
    await this.使用原生()
    await this.会话().执行脚本('mobile: terminateApp', [{ bundleId: this.应用配置.包名 }])
    await this.会话().执行脚本('mobile: activateApp', [{ bundleId: this.应用配置.包名 }])
    this.网页上下文 = undefined
    this.当前上下文 = 原生上下文
    await this.使用网页()
  }

  /** 回放用：动作已经做完，只等画面稳定（每 250ms 截一张缩小灰度图，连续两次差异小于 1% 即稳定，最多 6 秒），不做 OCR。 */
  public async 等待画面稳定(): Promise<{ 稳定: boolean; 稳定毫秒: number }> {
    return await 等待苹果画面稳定(() => this.截图(), this.取消信号)
  }

  public async 验证可见(目标: 苹果目标, 超时毫秒 = 10_000): Promise<void> {
    目标 = 苹果目标模型.parse(目标)
    this.检查超时(超时毫秒)
    if (是原生目标(目标)) {
      await this.等待原生(目标, 超时毫秒, '可见', false)
      return
    }
    await this.等待定位(目标, 超时毫秒, '可见', false, (值): boolean => 值.数量 === 1 && 值.可见数量 === 1)
  }

  public async 验证隐藏(目标: 苹果目标, 超时毫秒 = 10_000): Promise<void> {
    目标 = 苹果目标模型.parse(目标)
    this.检查超时(超时毫秒)
    if (是原生目标(目标)) {
      await this.等待原生(目标, 超时毫秒, '隐藏', false, false)
      return
    }
    await this.等待定位(目标, 超时毫秒, '隐藏', false, (值): boolean => 值.可见数量 === 0)
  }

  public async 关闭(): Promise<void> {
    let 错误们: unknown[] = []
    try {
      await this.appium?.关闭()
    } catch (错误) {
      错误们.push(错误)
    }
    this.appium = undefined
    try {
      await 执行Xcrun(['simctl', 'terminate', this.设备, this.应用配置.包名], new AbortController().signal, 15_000)
    } catch {
      // 应用已经退出时 terminate 会报错，可忽略。
    }
    for (let 步骤 of [
      async (): Promise<void> => {
        if (this.原外观 !== undefined)
          await 执行Xcrun(['simctl', 'ui', this.设备, 'appearance', this.原外观], new AbortController().signal, 15_000)
      },
      async (): Promise<void> => {
        if (this.是我们启动的模拟器 && (await 读取模拟器状态(this.设备, new AbortController().signal)) === 'Booted')
          await 执行Xcrun(['simctl', 'shutdown', this.设备], new AbortController().signal, 60_000)
      },
    ])
      try {
        await 步骤()
      } catch (错误) {
        错误们.push(错误)
      }
    this.原外观 = undefined
    try {
      if (this.拥有网络中转) await this.网络中转?.关闭()
      else this.网络中转?.恢复在线()
    } catch (错误) {
      错误们.push(错误)
    }
    if (错误们.length > 0) throw new AggregateError(错误们, '关闭 iOS 测试会话失败')
  }

  /** 窗口尺寸（点）在会话内不变，只读一次，后面的点击、滑动、观察都不用再切上下文。 */
  public async 读取窗口(): Promise<z.infer<typeof 矩形模型>> {
    if (this.窗口缓存 !== undefined) return this.窗口缓存
    await this.使用原生()
    try {
      this.窗口缓存 = 矩形模型.parse(await this.会话().请求('GET', '/window/rect'))
      return this.窗口缓存
    } finally {
      await this.使用网页()
    }
  }

  /** WebView 控件在屏幕上的位置和大小（点）。 */
  private async 读取网页范围(): Promise<z.infer<typeof 矩形模型>> {
    let 网页 = await this.网页上下文取得()
    await this.使用原生()
    try {
      let 元素 = 元素标识模型.parse(
        await this.会话().请求('POST', '/element', { using: '-ios class chain', value: '**/XCUIElementTypeWebView' }),
      )
      return 矩形模型.parse(
        await this.会话().请求('GET', `/element/${元素['element-6066-11e4-a52e-4f735466cecf']}/rect`),
      )
    } finally {
      await this.使用网页(网页)
    }
  }

  private async 点击点(x: number, y: number): Promise<void> {
    检查点坐标(x, y, await this.读取窗口())
    await this.使用原生()
    try {
      await this.发指针动作([
        { type: 'pointerMove', duration: 0, x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 80 },
        { type: 'pointerUp', button: 0 },
      ])
    } finally {
      await this.使用网页()
    }
  }

  private async 发指针动作(动作们: readonly Record<string, unknown>[]): Promise<void> {
    await this.会话().请求('POST', '/actions', {
      actions: [{ type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' }, actions: 动作们 }],
    })
    await this.会话().请求('DELETE', '/actions')
  }

  /** 在原生无障碍树里按条件找元素，返回每个匹配的屏幕位置（单位是点）。 */
  private async 查找原生(目标: 苹果目标): Promise<{ x: number; y: number; 宽: number; 高: number; 可见: boolean }[]> {
    await this.使用原生()
    let 谓词 = 生成原生谓词(目标)
    let 元素们 = z
      .array(元素标识模型)
      .parse(await this.会话().请求('POST', '/elements', { using: '-ios predicate string', value: 谓词 }))
    let 结果: { x: number; y: number; 宽: number; 高: number; 可见: boolean }[] = []
    for (let 元素 of 元素们) {
      let 编号 = 元素['element-6066-11e4-a52e-4f735466cecf']
      try {
        let 范围 = 矩形模型.parse(await this.会话().请求('GET', `/element/${编号}/rect`))
        let 显示 = z.boolean().parse(await this.会话().请求('GET', `/element/${编号}/displayed`))
        结果.push({
          x: 范围.x,
          y: 范围.y,
          宽: 范围.width,
          高: 范围.height,
          可见: 显示 && 范围.width > 0 && 范围.height > 0,
        })
      } catch {
        // 元素在查询期间消失，当作不存在。
      }
    }
    return 结果
  }

  private async 等待原生(
    目标: 苹果目标,
    超时毫秒: number,
    说明: string,
    要点击: boolean,
    应存在 = true,
  ): Promise<{ x: number; y: number; 宽: number; 高: number } | undefined> {
    let 超时信号 = AbortSignal.timeout(超时毫秒)
    let 信号 = AbortSignal.any([this.取消信号, 超时信号])
    let 最后数量 = 0
    try {
      while (true) {
        let 可见们 = (await this.查找原生(目标)).filter((元素) => 元素.可见)
        最后数量 = 可见们.length
        if (应存在 === false && 可见们.length === 0) return undefined
        if (应存在 && 可见们.length > 1) throw new Error(`iOS 目标匹配到多个元素：${目标.按}=${目标.值}`)
        if (应存在 && 可见们.length === 1) return 可见们[0]
        await 等待(250, undefined, { signal: 信号 })
      }
    } catch (错误) {
      this.取消信号.throwIfAborted()
      if (超时信号.aborted)
        throw new Error(`iOS 等待目标${说明}超时：${目标.按}=${目标.值}（可见匹配 ${String(最后数量)} 个）`, {
          cause: 错误,
        })
      void 要点击
      throw 错误
    } finally {
      await this.使用网页()
    }
  }

  private async 等待定位(
    目标: 苹果目标,
    超时毫秒: number,
    说明: string,
    要点击: boolean,
    满足: (值: z.infer<typeof 定位结果模型>) => boolean,
  ): Promise<z.infer<typeof 定位结果模型>> {
    let 超时信号 = AbortSignal.timeout(超时毫秒)
    let 信号 = AbortSignal.any([this.取消信号, 超时信号])
    let 最后: z.infer<typeof 定位结果模型> | undefined
    try {
      while (true) {
        await this.使用网页()
        最后 = 定位结果模型.parse(
          await this.会话().执行脚本(定位脚本, [目标.按 === '网页文字' ? 'text' : 'css', 目标.值, 要点击]),
        )
        if (满足(最后)) return 最后
        await 等待(250, undefined, { signal: 信号 })
      }
    } catch (错误) {
      this.取消信号.throwIfAborted()
      if (超时信号.aborted)
        throw new Error(
          `iOS 等待目标${说明}超时：${目标.按}=${目标.值}（匹配 ${String(最后?.数量)} 个，可见 ${String(最后?.可见数量)} 个，可点击 ${String(最后?.可点击)}，禁用 ${String(最后?.禁用)}）`,
          { cause: 错误 },
        )
      throw 错误
    }
  }

  private async 网页上下文取得(): Promise<string> {
    if (this.网页上下文 !== undefined) return this.网页上下文
    let 截止 = Date.now() + 30_000
    while (true) {
      this.取消信号.throwIfAborted()
      let 上下文们 = 上下文模型.parse(await this.会话().执行脚本('mobile: getContexts', [{ waitForWebviewMs: 3000 }]))
      let [候选, ...其余] = 筛选网页上下文(上下文们, this.网页地址前缀)
      if (候选 !== undefined && 其余.length === 0) return (this.网页上下文 = 候选)
      if (Date.now() > 截止) throw new Error(`iOS 测试 WebView 页面数量不是 1：${String(上下文们.length)}`)
      await 等待(500, undefined, { signal: this.取消信号 })
    }
  }

  private async 使用网页(名称?: string): Promise<void> {
    let 网页 = 名称 ?? (await this.网页上下文取得())
    if (this.当前上下文 === 网页) return
    try {
      await this.会话().请求('POST', '/context', { name: 网页 })
    } catch {
      this.网页上下文 = undefined
      网页 = await this.网页上下文取得()
      await this.会话().请求('POST', '/context', { name: 网页 })
    }
    this.当前上下文 = 网页
  }

  private async 使用原生(): Promise<void> {
    if (this.当前上下文 === 原生上下文) return
    await this.会话().请求('POST', '/context', { name: 原生上下文 })
    this.当前上下文 = 原生上下文
  }

  private 会话(): Appium会话 {
    if (this.appium === undefined) throw new Error('iOS 测试会话尚未启动')
    return this.appium
  }

  private 检查超时(超时毫秒: number): void {
    if (Number.isSafeInteger(超时毫秒) === false || 超时毫秒 <= 0) throw new Error('iOS 等待超时必须是正整数')
  }

  private async simctl(参数: readonly string[], 超时毫秒 = 120_000): Promise<Buffer> {
    return await 执行Xcrun(['simctl', ...参数], this.取消信号, 超时毫秒)
  }
}
