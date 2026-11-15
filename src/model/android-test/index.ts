import { readFile } from 'node:fs/promises'
import { setTimeout as 等待 } from 'node:timers/promises'
import { z } from 'zod'

import { 等待模板后点击, type 模板点击选项 } from '../../test-tools/template-match'
import { 屏幕转网页坐标, 比例是否一致, type 落点探测结果 } from '../web-locate/candidates'
import { 执行ADB } from './adb'
import { 解析安卓屏幕密度 } from './density'
import { 权限活动来自测试应用 } from './foreground'
import { 读取安卓非负整数, 通知权限状态稳定, type 安卓启动选项 } from './notification-preflight'
import { 寻找截图文字, 识别截图文字, type 截图文字识别结果 } from './ocr'
import type { 安卓界面元素, 安卓目标 } from './types'
import { 解析安卓界面, 解析安卓网页控件范围 } from './ui'
import { 安卓网页会话 } from './webview'

export { 执行ADB } from './adb'
export type { 安卓启动选项 } from './notification-preflight'
export { 确认OCR程序, 确认WindowsOCR程序 } from './ocr'
export type { 安卓界面元素, 安卓目标 } from './types'

let 权限窗口 = new Set([
  'com.android.permissioncontroller/com.android.permissioncontroller.permission.ui.GrantPermissionsActivity',
  'com.google.android.permissioncontroller/com.android.permissioncontroller.permission.ui.GrantPermissionsActivity',
])
let 系统分享窗口 = new Set([
  'android/com.android.internal.app.ChooserActivity',
  'com.android.intentresolver/.ChooserActivity',
  'com.android.intentresolver/.ChooserActivityLauncher',
  'com.android.intentresolver/com.android.intentresolver.ChooserActivity',
  'com.android.intentresolver/com.android.intentresolver.ChooserActivityLauncher',
])
let PNG签名 = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
let 安卓目标模型 = z.object({ 按: z.enum(['文字', '描述', '资源ID', '网页文字', '网页选择器']), 值: z.string().min(1) })

export class 安卓测试引擎 {
  private readonly 网页: 安卓网页会话

  public constructor(
    private readonly 设备序号: string,
    private readonly 取消信号: AbortSignal,
    private readonly 获得OCR程序: () => Promise<string>,
    private readonly 应用配置: { 包名: string; 启动组件: string; 网页来源: string },
  ) {
    if (/^[A-Za-z0-9][A-Za-z0-9._:[\]-]*$/u.test(设备序号) === false) throw new Error('Android 设备序号无效')
    this.网页 = new 安卓网页会话(
      设备序号,
      this.应用配置.包名,
      取消信号,
      async (): Promise<void> => {
        if ((await this.确认前台()) !== this.应用配置.启动组件) throw new Error('Android 测试应用的网页当前不可操作')
      },
      应用配置.网页来源,
    )
  }

  public async 启动(选项: 安卓启动选项 = {}): Promise<void> {
    await this.检查启动前状态(选项)
    await this.运行(['shell', 'am', 'force-stop', this.应用配置.包名])
    let 输出 = (await this.运行(['shell', 'am', 'start', '-W', '-n', this.应用配置.启动组件])).toString('utf8')
    if (/^Status: ok\s*$/mu.test(输出) === false) throw new Error(`Android 测试应用启动失败：${输出.trim()}`)
    await this.确认前台()
  }

  private async 检查启动前状态(选项: 安卓启动选项): Promise<void> {
    let 窗口 = await this.读取当前窗口(this.取消信号)
    if (窗口 === '') throw new Error('无法确定 Android 当前窗口，请解锁手机后重试')
    if (权限窗口.has(窗口) || 系统分享窗口.has(窗口))
      throw new Error('Android 当前有残留权限或分享弹窗，请先人工处理，再重新打开测试会话；框架不会自动关闭弹窗')
    let SDK = 读取安卓非负整数(
      (await this.运行(['shell', 'getprop', 'ro.build.version.sdk'])).toString('utf8'),
      '系统版本',
    )
    if (SDK < 33) return
    let 用户 = 读取安卓非负整数((await this.运行(['shell', 'am', 'get-current-user'])).toString('utf8'), '当前用户')
    let 权限 = (await this.运行(['shell', 'dumpsys', 'package', this.应用配置.包名])).toString('utf8')
    let 稳定 = 通知权限状态稳定(权限, 用户, this.应用配置.包名)
    if (稳定 === false && 选项.允许通知询问 !== true)
      throw new Error(
        '本地测试 App 的通知权限仍可能询问，请先在手机应用设置中明确处理通知权限；专门测试权限询问时使用 allowNotificationPrompt: true',
      )
    if ((await this.读取当前窗口(this.取消信号)) !== 窗口)
      throw new Error('启动前 Android 窗口已改变，请处理当前界面后重新打开测试会话')
    let 复查用户 = 读取安卓非负整数((await this.运行(['shell', 'am', 'get-current-user'])).toString('utf8'), '当前用户')
    if (复查用户 !== 用户) throw new Error('启动前 Android 用户已改变，请重新打开测试会话')
  }

  public async 截图(信号 = this.取消信号): Promise<Buffer> {
    await this.确认前台(信号)
    let 图片 = await this.运行(['exec-out', 'screencap', '-p'], 信号)
    if (图片.length < 24 || 图片.subarray(0, 8).equals(PNG签名) === false) throw new Error('Android 截图不是有效的 PNG')
    await this.确认前台(信号)
    return 图片
  }

  public async 识别截图文字(图片: Buffer, 信号 = this.取消信号): Promise<截图文字识别结果> {
    return await 识别截图文字(await this.获得OCR程序(), 图片, 信号)
  }

  public async 读取屏幕密度(信号 = this.取消信号): Promise<number> {
    return 解析安卓屏幕密度((await this.运行(['shell', 'wm', 'density'], 信号)).toString('utf8'))
  }

  public async 观察界面(): Promise<readonly 安卓界面元素[]> {
    return await this.读取界面(this.取消信号)
  }

  public async 观察网页(): Promise<string> {
    return await this.网页.观察()
  }

  public async 设置网页配色方案(配色方案: 'light' | 'dark'): Promise<void> {
    await this.网页.设置配色方案(配色方案)
  }

  public async 关闭(): Promise<void> {
    await this.网页.关闭()
  }

  private async 读取界面(信号: AbortSignal): Promise<readonly 安卓界面元素[]> {
    let 窗口 = await this.确认前台(信号)
    let XML = await this.读取界面XML(信号)
    let 元素们 = 解析安卓界面(XML)
    if ((await this.确认前台(信号)) !== 窗口) throw new Error('读取界面期间 Android 前台窗口已改变')
    return 元素们.filter((元素) => 元素.包名 === this.应用配置.包名 || this.是权限包(窗口, 元素.包名))
  }

  public async 点击(目标: 安卓目标, 超时毫秒 = 10_000): Promise<void> {
    目标 = 安卓目标模型.parse(目标)
    this.检查超时(超时毫秒)
    if (目标.按 === '网页文字' || 目标.按 === '网页选择器') {
      await this.网页.点击({ 按: 目标.按, 值: 目标.值 }, 超时毫秒)
      return
    }
    let 元素 = await this.等待目标(目标, true, 超时毫秒)
    if (元素 === undefined) throw new Error('目标不存在')
    let { 左, 上, 右, 下 } = 元素.范围
    if (左 >= 右 || 上 >= 下) throw new Error('目标没有可点击的屏幕区域')
    await this.点击坐标(Math.floor((左 + 右) / 2), Math.floor((上 + 下) / 2))
  }

  public async 点击坐标(x: number, y: number): Promise<void> {
    await this.点击屏幕坐标(x, y)
  }

  public async 点击截图文字(文字: string): Promise<{ x: number; y: number }> {
    if ((await this.确认前台()) !== this.应用配置.启动组件) throw new Error('Android OCR 点击需要测试应用处于前台')
    let 图片 = await this.截图()
    let { x, y } = await 寻找截图文字(await this.获得OCR程序(), 图片, 文字, this.取消信号)
    await this.点击屏幕坐标(x, y, 图片)
    return { x, y }
  }

  /** 截图后用 OCR 找到唯一匹配的文字，只返回坐标（物理像素，不点击）。录制时先认出落点元素，再点击。 */
  public async 查找截图文字(文字: string): Promise<{ x: number; y: number }> {
    if ((await this.确认前台()) !== this.应用配置.启动组件) throw new Error('Android OCR 点击需要测试应用处于前台')
    let 图片 = await this.截图()
    return await 寻找截图文字(await this.获得OCR程序(), 图片, 文字, this.取消信号)
  }

  /**
   * 没有 DOM 可定位的点击（Canvas、原生界面）：回放时在原坐标附近用图片模板找目标，找到再点击。
   * 模板路径可以是绝对路径，也可以是相对流程文件的 URL（new URL('assets/x.png', import.meta.url)）。
   * Android 的操作坐标就是物理像素，截图与坐标比例为 1。
   */
  public async 等待图片后点击(
    模板: string | URL,
    选项: 模板点击选项,
    超时毫秒 = 15_000,
  ): Promise<{ x: number; y: number }> {
    this.检查超时(超时毫秒)
    let 模板图片 = await readFile(模板)
    return await 等待模板后点击({
      模板图片,
      选项,
      超时毫秒,
      取消信号: this.取消信号,
      截图: async (): Promise<{ 图片: Buffer; 坐标宽: number }> => {
        let 图片 = await this.截图()
        return { 图片, 坐标宽: 图片.readUInt32BE(16) }
      },
      点击: async (x, y): Promise<void> => await this.点击屏幕坐标(x, y),
      说明: 'Android ',
    })
  }

  /** WebView 当前的页面地址。 */
  public async 读取地址(): Promise<string> {
    return await this.网页.读取地址()
  }

  /** 等页面地址的 pathname 加 hash 与目标一致（忽略 origin）；超时报错并说明实际地址。 */
  public async 等待地址(目标: string, 超时毫秒 = 10_000): Promise<void> {
    this.检查超时(超时毫秒)
    await this.网页.等待地址(目标, 超时毫秒)
  }

  /**
   * 坐标点击的落点识别：屏幕物理像素换算成 WebView 里的 CSS 坐标（用 uiautomator 里 WebView 的范围和页面视口之比，已含像素密度），
   * 穿透 Shadow DOM 找落点元素并用 Playwright 定位器当场验证唯一。落在 WebView 之外返回无定位。
   */
  public async 探测落点(x: number, y: number): Promise<落点探测结果> {
    let 视口 = await this.网页.读取视口()
    let 范围 = 解析安卓网页控件范围(await this.读取界面XML(this.取消信号))
    范围 ??= { 左: 0, 上: 0, 宽: 视口.宽 * 视口.密度, 高: 视口.高 * 视口.密度 }
    if (比例是否一致(范围, 视口) === false)
      return {
        状态: '无定位',
        原因: `WebView 范围 ${String(范围.宽)}×${String(范围.高)} 与页面视口 ${String(视口.宽)}×${String(视口.高)} 比例不符`,
        命中: '未知元素',
      }
    let 点 = 屏幕转网页坐标({ x, y }, 范围, 视口)
    if (点 === undefined) return { 状态: '无定位', 原因: '落点不在 WebView 内', 命中: '原生界面' }
    return await this.网页.探测落点(点)
  }

  private async 点击屏幕坐标(x: number, y: number, OCR截图?: Buffer): Promise<void> {
    let 窗口 = await this.检查坐标们([{ x, y }], OCR截图)
    if (OCR截图 !== undefined && 窗口 !== this.应用配置.启动组件) throw new Error('Android OCR 识别期间前台窗口已改变')
    await this.运行(['shell', 'input', 'tap', String(x), String(y)])
  }

  public async 滑动(x1: number, y1: number, x2: number, y2: number, 耗时毫秒 = 300): Promise<void> {
    if (Number.isSafeInteger(耗时毫秒) === false || 耗时毫秒 <= 0 || 耗时毫秒 > 60_000)
      throw new Error('滑动耗时必须是 1 到 60000 毫秒之间的整数')
    await this.检查坐标们([
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ])
    await this.运行(['shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(耗时毫秒)])
  }

  public async 返回(): Promise<void> {
    await this.确认前台()
    await this.运行(['shell', 'input', 'keyevent', 'KEYCODE_BACK'])
  }

  public async 输入(文字: string): Promise<void> {
    if (/^[A-Za-z0-9_.,@:/+ -]+$/u.test(文字) === false)
      throw new Error('ADB 文本输入目前只支持英文字母、数字、空格和 _ . , @ : / + -')
    await this.确认前台()
    await this.运行(['shell', 'input', 'text', 文字.replaceAll(' ', '%s')])
  }

  public async 验证可见(目标: 安卓目标, 超时毫秒 = 10_000): Promise<void> {
    await this.验证目标(目标, true, 超时毫秒)
  }

  public async 验证隐藏(目标: 安卓目标, 超时毫秒 = 10_000): Promise<void> {
    await this.验证目标(目标, false, 超时毫秒)
  }

  public async 验证并取消系统分享(超时毫秒 = 10_000): Promise<Buffer> {
    this.检查超时(超时毫秒)
    let 超时信号 = AbortSignal.timeout(超时毫秒)
    let 信号 = AbortSignal.any([this.取消信号, 超时信号])
    try {
      while (true) {
        let 当前窗口 = await this.读取当前窗口(信号)
        if (系统分享窗口.has(当前窗口)) {
          let 截图 = await this.运行(['exec-out', 'screencap', '-p'], 信号)
          if ((await this.读取当前窗口(信号)) !== 当前窗口) throw new Error('Android 系统分享面板已离开前台')
          await this.运行(['shell', 'input', 'keyevent', 'KEYCODE_BACK'], 信号)
          while (true) {
            let 返回窗口 = await this.读取当前窗口(信号)
            if (返回窗口 === this.应用配置.启动组件) break
            if (返回窗口 !== '' && 系统分享窗口.has(返回窗口) === false)
              throw new Error(`取消系统分享后 Android 前台窗口不是测试应用：${返回窗口}`)
            await 等待(250, undefined, { signal: 信号 })
          }
          return 截图
        }
        if (当前窗口 !== '' && 当前窗口 !== this.应用配置.启动组件)
          throw new Error(`Android 前台窗口不是系统分享面板：${当前窗口}`)
        await 等待(250, undefined, { signal: 信号 })
      }
    } catch (错误) {
      if (超时信号.aborted) throw new Error('Android 系统分享面板未打开', { cause: 错误 })
      throw 错误
    }
  }

  private async 验证目标(目标: 安卓目标, 应可见: boolean, 超时毫秒: number): Promise<void> {
    目标 = 安卓目标模型.parse(目标)
    this.检查超时(超时毫秒)
    if (目标.按 === '网页文字' || 目标.按 === '网页选择器') {
      await this.网页.验证({ 按: 目标.按, 值: 目标.值 }, 应可见, 超时毫秒)
      return
    }
    await this.等待目标(目标, 应可见, 超时毫秒)
  }

  private async 等待目标(目标: 安卓目标, 应可见: boolean, 超时毫秒: number): Promise<安卓界面元素 | undefined> {
    目标 = 安卓目标模型.parse(目标)
    this.检查超时(超时毫秒)
    let 超时信号 = AbortSignal.timeout(超时毫秒)
    let 信号 = AbortSignal.any([this.取消信号, 超时信号])
    try {
      while (true) {
        let 匹配们 = (await this.读取界面(信号)).filter((元素) => {
          if (元素.范围.左 >= 元素.范围.右 || 元素.范围.上 >= 元素.范围.下) return false
          switch (目标.按) {
            case '文字':
              return 元素.文字 === 目标.值
            case '描述':
              return 元素.描述 === 目标.值
            case '资源ID':
              return 元素.资源ID === 目标.值
            case '网页文字':
            case '网页选择器':
              throw new Error('网页目标不能用于 Android 界面树')
          }
        })
        if (匹配们.length > 1 && 应可见) throw new Error(`Android 目标匹配到多个元素：${目标.按}=${目标.值}`)
        if (匹配们.length === 0 && 应可见 === false) return undefined
        if (匹配们.length === 1 && 应可见) return 匹配们[0]
        await 等待(250, undefined, { signal: 信号 })
      }
    } catch (错误) {
      this.取消信号.throwIfAborted()
      if (超时信号.aborted)
        throw new Error(`Android 等待目标${应可见 ? '可见' : '隐藏'}超时：${目标.按}=${目标.值}`, { cause: 错误 })
      throw 错误
    }
  }

  private async 检查坐标们(坐标们: readonly { x: number; y: number }[], OCR截图?: Buffer): Promise<string> {
    let 图片 = await this.截图()
    let 宽 = 图片.readUInt32BE(16)
    let 高 = 图片.readUInt32BE(20)
    if (OCR截图 !== undefined && (宽 !== OCR截图.readUInt32BE(16) || 高 !== OCR截图.readUInt32BE(20)))
      throw new Error('Android OCR 识别期间屏幕尺寸已改变')
    for (let { x, y } of 坐标们)
      if (
        Number.isSafeInteger(x) === false ||
        Number.isSafeInteger(y) === false ||
        x < 0 ||
        y < 0 ||
        x >= 宽 ||
        y >= 高
      )
        throw new Error(`Android 坐标超出屏幕范围 ${String(宽)}×${String(高)}：${String(x)}, ${String(y)}`)
    return await this.确认前台()
  }

  private 检查超时(超时毫秒: number): void {
    if (Number.isSafeInteger(超时毫秒) === false || 超时毫秒 <= 0) throw new Error('Android 等待超时必须是正整数')
  }

  private async 读取当前窗口(信号: AbortSignal): Promise<string> {
    let 输出 = (await this.运行(['shell', 'dumpsys', 'window'], 信号)).toString('utf8')
    return /^\s*mCurrentFocus=Window\{[^\r\n]*?\su\d+\s+([^\s}]+)/mu.exec(输出)?.[1] ?? ''
  }

  private async 确认前台(信号 = this.取消信号): Promise<string> {
    let 当前窗口 = await this.读取当前窗口(信号)
    if (当前窗口 === '') throw new Error('无法确定 Android 前台窗口，请解锁手机并保持屏幕开启后重试')
    if (当前窗口.startsWith('com.android.systemui/'))
      throw new Error('Android 系统界面占据前台，请解锁手机并关闭通知栏后重试')
    if (当前窗口 !== this.应用配置.启动组件 && 权限窗口.has(当前窗口) === false)
      throw new Error(`Android 前台窗口不是测试应用：${当前窗口}`)
    if (权限窗口.has(当前窗口)) await this.确认权限来源(当前窗口, 信号)
    return 当前窗口
  }

  private async 读取界面XML(信号 = this.取消信号): Promise<string> {
    return (await this.运行(['shell', '-tt', 'uiautomator', 'dump', '/dev/tty'], 信号)).toString('utf8')
  }

  private async 确认权限来源(窗口: string, 信号: AbortSignal): Promise<void> {
    if (权限窗口.has(窗口) === false) throw new Error('Android 前台不是允许的权限窗口')
    let 输出 = (await this.运行(['shell', 'dumpsys', 'activity', 'activities'], 信号)).toString('utf8')
    if (权限活动来自测试应用(输出, 窗口, this.应用配置.包名, this.应用配置.启动组件) === false)
      throw new Error('权限弹窗后方没有可验证的测试应用界面或活动来源')
    if ((await this.读取当前窗口(信号)) !== 窗口) throw new Error('验证权限来源期间 Android 前台窗口已改变')
  }

  private 是权限包(窗口: string, 包名: string): boolean {
    return 权限窗口.has(窗口) && 窗口.startsWith(`${包名}/`)
  }

  private async 运行(参数: readonly string[], 信号 = this.取消信号): Promise<Buffer> {
    return await 执行ADB(['-s', this.设备序号, ...参数], 信号)
  }
}
