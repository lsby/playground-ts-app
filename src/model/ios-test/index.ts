import { z } from 'zod'

import { 动作前执行 } from '../../test-tools/action-guard'
import { 动作未执行错误, 标记动作已执行 } from '../../test-tools/action-phase'
import type { 模板点击选项 } from '../../test-tools/template-match'
import { 寻找截图文字 } from '../android-test/ocr'
import { type 落点探测结果 } from '../web-locate/candidates'
import { 整理网页可见文字, 格式化点中元素, 点击现场记录, 网页可见文字脚本 } from '../web-locate/diagnostics'
import { 检查等待超时, 调用信号持有者 } from './abortable'
import { Appium会话 } from './appium'
import type { Appium配置 } from './appium-dir'
import { 目标已停稳, type 定位结果 } from './click-ready'
import { 关闭苹果会话 } from './close'
import { 向焦点输入框输入, 检查点坐标, 生成滑动动作 } from './input'
import { 准备测试包 } from './install'
import { 等待苹果原生元素 } from './native-wait'
import type { 苹果网络中转, 苹果网络状态 } from './network-relay'
import { 解析苹果界面 } from './parse-screen'
import { 重新加载苹果网页 } from './reload'
import { 创建Appium常驻管理器 } from './resident'
import { 元素标识模型, 矩形模型, 解析点击目标, 解析等待目标 } from './schema'
import { 截取模拟器画面 } from './screenshot'
import { 执行Xcrun, 设置应用语言, 读取应用进程号, 读取模拟器状态, 进程存活 } from './simctl'
import { 处理系统弹框, 读取系统弹框, type 系统弹框信息 } from './system-alert'
import type { 苹果界面元素, 苹果目标 } from './types'
import { 切换到网页上下文, 解析网页上下文, 读取网页地址 } from './web-context'
import { 探测苹果落点, 描述苹果点击点, 等待苹果模板后点击, 等待苹果画面稳定, 轮询等待地址 } from './web-probe'
import { 观察网页脚本 } from './web-script'
import { 等待苹果网页定位 } from './web-wait'
import { 读取窗口矩形 } from './window-rect'

export { 计算苹果应用摘要 } from './app-digest'
export { 苹果网络中转, 计算苹果中转端口 } from './network-relay'
export type { 苹果网络状态 } from './network-relay'
export { 执行Xcrun } from './simctl'
export type { 苹果界面元素, 苹果目标 } from './types'

let 原生上下文 = 'NATIVE_APP'

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
  /** 被测应用当前的进程号缓存；应用重启、网页定位找不到页面时清掉重取。网页上下文只认这个进程的页面。 */
  private 应用进程号: number | undefined
  private 原外观: 'light' | 'dark' | undefined
  private 是我们启动的模拟器 = false
  private 窗口缓存: z.infer<typeof 矩形模型> | undefined
  private readonly 点击现场 = new 点击现场记录()
  /** 当前 MCP 工具调用的取消信号；调用方超时或放弃时触发，让正在跑的等待和请求马上结束 */
  public readonly 调用信号 = new 调用信号持有者()

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
    this.appium = await Appium会话.启动(this.取消信号, this.应用配置.Appium, this.调用信号)
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
          // 录制时等待人工查看画面，保留会话一小时。失效后由调用方重新打开。
          'appium:newCommandTimeout': 3600,
        },
        900_000,
      )
      this.当前上下文 = 原生上下文
      this.appium.设置页面丢失恢复(() => this.恢复网页页面())
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
    return await 截取模拟器画面(this.设备, AbortSignal.any([this.取消信号, 信号]))
  }

  /** 切换模拟的网络：online 透传，offline 像飞行模式一样拒绝连接，hang 接住连接但不回复，maintenance 模拟服务器升级（OPTIONS 回 204，其他请求回 503 JSON），crash 模拟主服务崩溃、nginx 回 502 JSON（错误码「服务暂时不可用」，预检同样回 204）。切换时断开现存连接，杀掉重开应用时状态保持。 */
  public 设置网络(状态: 苹果网络状态): void {
    if (this.网络中转 === undefined) throw new Error('当前测试会话没有网络中转')
    this.网络中转.设置状态(状态)
  }

  public async 设置配色方案(配色方案: 'light' | 'dark'): Promise<void> {
    await this.simctl(['ui', this.设备, 'appearance', 配色方案])
  }

  /**
   * 点击目标，返回点击前坐标处最上层元素的描述（网页目标才有，原生目标没有）。
   * 网页目标点之前要等目标停稳：可见、中心点没被别的层盖住、目标及祖先上的有限动画播完、连续两次定位位置大小不变；
   * 目标或祖先有循环动画时位置永远不会稳定，只检查前三项。总超时沿用 超时毫秒，超时报错会说明卡在哪一项、被谁盖住。
   */
  public async 点击(目标: 苹果目标, 超时毫秒 = 10_000): Promise<string | undefined> {
    目标 = 解析点击目标(目标)
    检查等待超时(超时毫秒)
    if (是原生目标(目标)) {
      let 元素 = await 动作前执行(() => this.等待原生(目标, 超时毫秒, '可点击', true))
      if (元素 === undefined) throw new 动作未执行错误('目标不存在')
      await this.点击点(Math.round(元素.x + 元素.宽 / 2), Math.round(元素.y + 元素.高 / 2))
      return undefined
    }
    let 结果 = await 动作前执行(() => this.等待定位(目标, 超时毫秒, '可点击', true, 目标已停稳))
    let 描述 = 格式化点中元素(结果.点中)
    this.点击现场.记录(描述)
    let { x, y, width, height } = await this.读取网页范围()
    await this.点击点(Math.round(x + (结果.x * width) / 结果.宽), Math.round(y + (结果.y * height) / 结果.高))
    return 描述
  }

  /** 点击屏幕坐标。坐标单位是「点」（逻辑像素，iPhone 17 为 402×874），不是截图像素。 */
  public async 点击坐标(x: number, y: number): Promise<string | undefined> {
    let 描述 = await this.记录点击点现场(x, y)
    await this.点击点(x, y)
    return 描述
  }

  /** 读取原生无障碍树的精简列表（位置和尺寸单位是「点」）。 */
  public async 观察界面(): Promise<readonly 苹果界面元素[]> {
    return await this.在原生上下文执行(async () =>
      解析苹果界面(z.string().parse(await this.会话().请求('GET', '/source'))),
    )
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
    for (let [x, y] of [
      [x1, y1],
      [x2, y2],
    ] as const)
      检查点坐标(x, y, await this.读取窗口())
    await this.在原生上下文执行(() => this.发指针动作(生成滑动动作(x1, y1, x2, y2, 耗时毫秒)))
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
    let 点 = await 动作前执行(() => this.查找截图文字(文字))
    await this.记录点击点现场(点.x, 点.y)
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
    let 点击 = async (x: number, y: number): Promise<void> => {
      await this.记录点击点现场(x, y)
      await this.点击点(x, y)
    }
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
    let { 地址, 上下文 } = await 读取网页地址(
      this.会话(),
      {
        网页地址前缀: this.网页地址前缀,
        取进程号: (强制) => this.取得应用进程号(强制),
        取消信号: this.取消信号,
        超时毫秒: 10_000,
      },
      this.网页上下文,
      this.当前上下文,
      () => this.清除网页上下文缓存(),
    )
    this.网页上下文 = 上下文
    this.当前上下文 = 上下文
    return 地址
  }

  /** 等页面地址的 pathname 加 hash 与目标一致（忽略 origin，热重载包和打包版通用）；超时报错并说明实际地址。 */
  public async 等待地址(目标: string, 超时毫秒 = 10_000): Promise<void> {
    await this.点击现场.包裹(() => 轮询等待地址(() => this.读取地址(), 目标, 超时毫秒, this.取消信号))
  }

  /**
   * 坐标点击的落点识别：把点坐标换算成 WebView 里的 CSS 坐标，穿透 Shadow DOM 找到落点元素，
   * 生成定位并用 iOS 引擎自己的查询逻辑当场验证唯一。落在 WebView 之外（原生界面）返回无定位。
   */
  public async 探测落点(x: number, y: number): Promise<落点探测结果> {
    let 范围 = await this.读取网页范围()
    return await 探测苹果落点(this.会话(), 范围, { x, y })
  }

  /** 失败现场用：WebView 里页面可见文字（innerText，压缩空行，最多约 3000 字）。 */
  public async 读取网页可见文字(): Promise<string> {
    try {
      await this.使用网页()
      return 整理网页可见文字(z.string().parse(await this.会话().执行脚本(网页可见文字脚本)))
    } catch (错误) {
      // 页面可能整页换过文档，缓存的网页上下文失效：清掉让下次重新查找（失败现场会重试一次）
      this.清除网页上下文缓存()
      this.应用进程号 = undefined
      throw 错误
    }
  }

  /** 点击屏幕坐标前记下该处最上层元素的描述（诊断，失败返回 undefined），见 描述苹果点击点。 */
  private async 记录点击点现场(x: number, y: number): Promise<string | undefined> {
    try {
      let 描述 = await 描述苹果点击点(this.会话(), await this.读取网页范围(), { x, y })
      this.点击现场.记录(描述)
      return 描述
    } catch {
      this.取消信号.throwIfAborted()
      return undefined
    }
  }

  /** 向当前获得焦点的输入框输入文字，走系统键盘。默认在已有文字后追加；`清空` 为 true 时先清空再输入，此时文字可以为空（只清空）。 */
  public async 输入(文字: string, { 清空 = false }: { 清空?: boolean } = {}): Promise<void> {
    await 动作前执行(async () => {
      if (文字 === '' && 清空 === false) throw new Error('iOS 输入内容不能为空；要清空输入框请把清空设为 true')
      await this.使用原生()
    })
    try {
      await 向焦点输入框输入(this.会话(), 文字, 清空)
      标记动作已执行()
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
    this.清除网页上下文缓存()
    this.应用进程号 = undefined
    this.当前上下文 = 原生上下文
    await this.使用网页()
  }

  /** 当前有没有系统弹框（通知权限等），有就返回文字和按钮。 */
  public async 读取系统弹框(): Promise<系统弹框信息 | undefined> {
    return await this.在原生上下文执行(() => 读取系统弹框(this.会话()))
  }

  /**
   * 点系统弹框的按钮（原生文字、网页坐标都点不到它），见 处理系统弹框。返回是否点了。
   * 必须在原生上下文里点：实测在 WebView 上下文里 mobile: alert 带 buttonLabel 点「使用App时允许」，系统会把定位权限记成拒绝（locationd 里 Authorization 为 1）。
   */
  public async 处理系统弹框(
    动作: 'accept' | 'dismiss',
    选项: { 按钮文字?: string; 仅当出现时?: boolean; 超时毫秒?: number } = {},
  ): Promise<boolean> {
    let 参数 = { 动作, 按钮文字: 选项.按钮文字, 仅当出现时: 选项.仅当出现时 ?? false, 超时毫秒: 选项.超时毫秒 ?? 5000 }
    return await this.在原生上下文执行(() => 处理系统弹框(this.会话(), 参数, this.取消信号))
  }

  /** 只刷新网页：当前 WebView 整页重新加载，不重启 App、不清数据，等新文档加载完成再返回。 */
  public async 重新加载网页(超时毫秒 = 30_000): Promise<void> {
    await 重新加载苹果网页({
      会话: this.会话(),
      使用网页: () => this.使用网页(),
      清缓存: () => this.清除网页上下文缓存(),
      取消信号: this.取消信号,
      超时毫秒,
    })
  }

  /** 回放用：动作已经做完，只等画面稳定（每 250ms 截一张缩小灰度图，连续两次差异小于 1% 即稳定，最多 6 秒），不做 OCR。 */
  public async 等待画面稳定(): Promise<{ 稳定: boolean; 稳定毫秒: number }> {
    return await 等待苹果画面稳定(() => this.截图(), this.取消信号)
  }

  public async 验证可见(目标: 苹果目标, 超时毫秒 = 10_000): Promise<void> {
    目标 = 解析等待目标(目标)
    检查等待超时(超时毫秒)
    if (是原生目标(目标)) {
      await this.等待原生(目标, 超时毫秒, '可见', false)
      return
    }
    await this.等待定位(目标, 超时毫秒, '可见', false, (值): boolean => 值.数量 === 1 && 值.可见数量 === 1)
  }

  public async 验证隐藏(目标: 苹果目标, 超时毫秒 = 10_000): Promise<void> {
    目标 = 解析等待目标(目标)
    检查等待超时(超时毫秒)
    if (是原生目标(目标)) {
      await this.等待原生(目标, 超时毫秒, '隐藏', false, false)
      return
    }
    await this.等待定位(目标, 超时毫秒, '隐藏', false, (值): boolean => 值.可见数量 === 0)
  }

  public async 关闭(): Promise<void> {
    let 会话 = this.appium
    this.appium = undefined
    let 原外观 = this.原外观
    this.原外观 = undefined
    await 关闭苹果会话({
      会话,
      设备: this.设备,
      包名: this.应用配置.包名,
      原外观,
      要关闭模拟器: this.是我们启动的模拟器,
      网络中转: this.网络中转,
      拥有网络中转: this.拥有网络中转,
    })
  }

  /** 窗口尺寸（点）在会话内不变，只读一次，后面的点击、滑动、观察都不用再切上下文。 */
  public async 读取窗口(): Promise<z.infer<typeof 矩形模型>> {
    if (this.窗口缓存 !== undefined) return this.窗口缓存
    this.窗口缓存 = await this.在原生上下文执行(() => 读取窗口矩形(this.会话()))
    return this.窗口缓存
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
    await 动作前执行(async () => {
      检查点坐标(x, y, await this.读取窗口())
      await this.使用原生()
    })
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
    标记动作已执行()
    await this.会话().请求('DELETE', '/actions')
  }

  private 等待原生(
    目标: 苹果目标,
    超时毫秒: number,
    说明: string,
    _要点击: boolean,
    应存在 = true,
  ): Promise<{ x: number; y: number; 宽: number; 高: number } | undefined> {
    return 等待苹果原生元素({
      会话: () => this.会话(),
      使用原生: () => this.使用原生(),
      使用网页: () => this.使用网页(),
      取消信号: this.调用信号.合并(this.取消信号),
      点击现场: this.点击现场,
      目标,
      超时毫秒,
      说明,
      应存在,
    })
  }

  private 等待定位(
    目标: 苹果目标,
    超时毫秒: number,
    说明: string,
    要点击: boolean,
    满足: (值: 定位结果, 上次: 定位结果 | undefined) => boolean,
  ): Promise<定位结果> {
    return 等待苹果网页定位({
      会话: () => this.会话(),
      使用网页: () => this.使用网页(),
      取消信号: this.调用信号.合并(this.取消信号),
      点击现场: this.点击现场,
      目标,
      超时毫秒,
      说明,
      要点击,
      满足,
    })
  }

  private async 网页上下文取得(): Promise<string> {
    if (this.网页上下文 !== undefined) return this.网页上下文
    return (this.网页上下文 = await this.解析当前网页上下文(30_000))
  }

  private 解析当前网页上下文(超时毫秒 = 30_000): Promise<string> {
    return 解析网页上下文({
      会话: this.会话(),
      网页地址前缀: this.网页地址前缀,
      取进程号: (强制) => this.取得应用进程号(强制),
      缓存: this.网页上下文,
      取消信号: this.调用信号.合并(this.取消信号),
      超时毫秒,
    })
  }

  /** 网页脚本报页面已不存在时由 Appium会话 调用：回原生、清掉缓存的页面和进程号，按当前进程重新找页面并切过去。 */
  private async 恢复网页页面(): Promise<void> {
    await this.会话()
      .请求('POST', '/context', { name: 原生上下文 })
      .catch((): void => {})
    this.清除网页上下文缓存()
    this.应用进程号 = undefined
    this.当前上下文 = 原生上下文
    await this.使用网页()
  }

  private 清除网页上下文缓存(): void {
    this.网页上下文 = undefined
    this.当前上下文 = undefined
  }

  /** 被测应用当前的进程号（simctl 查）；缓存的进程已经不在时重新查。强制为 true 时忽略缓存。 */
  private async 取得应用进程号(强制: boolean): Promise<number | undefined> {
    if (强制 === false && this.应用进程号 !== undefined && 进程存活(this.应用进程号)) return this.应用进程号
    this.应用进程号 = await 读取应用进程号(this.设备, this.应用配置.包名, this.取消信号)
    return this.应用进程号
  }

  private async 使用网页(名称?: string): Promise<void> {
    let 网页 = 名称 ?? (await this.网页上下文取得())
    if (this.当前上下文 === 网页) return
    try {
      await this.会话().请求('POST', '/context', { name: 网页 })
    } catch (错误) {
      // 缓存的页面失效（进程换了、整页换文档）：先回原生，按当前进程重新找页面再切，仍报 No targets 时在里面有限次重试
      this.网页上下文 = undefined
      await this.会话()
        .请求('POST', '/context', { name: 原生上下文 })
        .catch((): void => {})
      网页 = await 切换到网页上下文(
        this.会话(),
        () => this.解析当前网页上下文(),
        undefined,
        () => this.清除网页上下文缓存(),
        错误,
      )
      this.网页上下文 = 网页
    }
    this.当前上下文 = 网页
  }

  private async 在原生上下文执行<T>(执行: () => Promise<T>): Promise<T> {
    await this.使用原生()
    try {
      return await 执行()
    } finally {
      await this.使用网页()
    }
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

  private async simctl(参数: readonly string[], 超时毫秒 = 120_000): Promise<Buffer> {
    return await 执行Xcrun(['simctl', ...参数], this.取消信号, 超时毫秒)
  }
}
