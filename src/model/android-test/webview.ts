import { chromium, expect, type Browser, type Locator, type Page } from '@playwright/test'

import type { 落点探测结果 } from '../web-locate/candidates'
import { 地址一致 } from '../web-locate/page-url'
import { 执行页面脚本, 探测页面落点 } from '../web-locate/playwright'
import { 执行ADB } from './adb'

type 网页目标 = { 按: '网页文字' | '网页选择器'; 值: string }

export class 安卓网页会话 {
  private 浏览器: Browser | undefined
  private 端口: number | undefined
  private 打开任务: Promise<Page> | undefined
  private 关闭任务: Promise<void> | undefined
  private 已关闭 = false

  public constructor(
    private readonly 设备序号: string,
    private readonly 应用包名: string,
    private readonly 取消信号: AbortSignal,
    private readonly 确认前台: () => Promise<void>,
    private readonly 允许网页来源 = 'https://localhost',
  ) {}

  public async 观察(): Promise<string> {
    let 页面 = await this.获得页面()
    let 内容 = await 页面.locator('body').ariaSnapshot({ timeout: 10_000 })
    await this.检查页面(页面)
    return 内容
  }

  /** 页面当前地址（page.url()）。 */
  public async 读取地址(): Promise<string> {
    let 页面 = await this.获得页面()
    return 页面.url()
  }

  /** 等页面地址的 pathname 加 hash 与目标一致（忽略 origin）；超时报错并说明实际地址。 */
  public async 等待地址(目标: string, 超时毫秒: number): Promise<void> {
    let 页面 = await this.获得页面()
    let 截止 = Date.now() + 超时毫秒
    while (true) {
      this.取消信号.throwIfAborted()
      // 等待期间整页换文档可能让页面对象换新
      if (页面.isClosed()) 页面 = await this.获得页面()
      let 实际 = 页面.url()
      if (地址一致(实际, 目标)) {
        await this.检查页面(页面)
        return
      }
      if (Date.now() >= 截止) throw new Error(`Android 等待地址超时：期望 ${目标}，实际 ${实际}`)
      await 页面.waitForTimeout(100)
    }
  }

  /** 页面视口（CSS 像素）和像素密度，用来把屏幕物理像素换算成页面坐标。 */
  public async 读取视口(): Promise<{ 宽: number; 高: number; 密度: number }> {
    let 页面 = await this.获得页面()
    let 值 = (await 执行页面脚本(
      页面,
      'return { 宽: window.innerWidth, 高: window.innerHeight, 密度: window.devicePixelRatio }',
    )) as { 宽: number; 高: number; 密度: number }
    return 值
  }

  /** 页面（CSS 视口）坐标处的落点识别。 */
  public async 探测落点(点: { x: number; y: number }): Promise<落点探测结果> {
    let 页面 = await this.获得页面()
    return await 探测页面落点(页面, 点)
  }

  public async 设置配色方案(配色方案: 'light' | 'dark'): Promise<void> {
    let 页面 = await this.获得页面()
    await 页面.emulateMedia({ colorScheme: 配色方案 })
    await this.检查页面(页面)
  }

  public async 点击(目标: 网页目标, 超时毫秒: number): Promise<void> {
    let 页面 = await this.获得页面()
    let 定位 = this.定位(页面, 目标)
    let 输入 = await 页面.context().newCDPSession(页面)
    try {
      await 定位.click({ trial: true, timeout: 超时毫秒 })
      await this.检查页面(页面)
      // ADB 前台检查期间键盘可能改变视口，触摸前重新确认布局并取坐标。
      await 定位.click({ trial: true, timeout: 超时毫秒 })
      let 范围 = await 定位.boundingBox({ timeout: 超时毫秒 })
      if (范围 === null) throw new Error('Android WebView 目标已离开可点击区域')
      await 输入.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 范围.x + 范围.width / 2, y: 范围.y + 范围.height / 2 }],
      })
      await 输入.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } finally {
      await 输入.detach()
    }
  }

  public async 验证(目标: 网页目标, 应可见: boolean, 超时毫秒: number): Promise<void> {
    let 页面 = await this.获得页面()
    let 定位 = this.定位(页面, 目标)
    if (应可见) await expect(定位).toBeVisible({ timeout: 超时毫秒 })
    else await expect(定位).toBeHidden({ timeout: 超时毫秒 })
    await this.检查页面(页面)
  }

  public 关闭(): Promise<void> {
    this.已关闭 = true
    this.关闭任务 ??= this.执行关闭()
    return this.关闭任务
  }

  private async 执行关闭(): Promise<void> {
    if (this.打开任务 !== undefined) {
      try {
        await this.打开任务
      } catch {
        // 连接失败会在其调用方报告；继续释放已分配的资源。
      }
    }
    await this.释放资源()
  }

  private async 释放资源(): Promise<void> {
    let 错误们: unknown[] = []
    if (this.浏览器 !== undefined) {
      try {
        await this.浏览器.close()
      } catch (错误) {
        错误们.push(new Error(`断开 Android WebView 连接失败（设备 ${this.设备序号}）`, { cause: 错误 }))
      } finally {
        this.浏览器 = undefined
      }
    }
    if (this.端口 !== undefined) {
      try {
        await 执行ADB(
          ['-s', this.设备序号, 'forward', '--remove', `tcp:${String(this.端口)}`],
          AbortSignal.timeout(5_000),
        )
      } catch (错误) {
        错误们.push(
          new Error(
            `移除 Android WebView 转发失败（adb -s ${this.设备序号} forward --remove tcp:${String(this.端口)}）`,
            { cause: 错误 },
          ),
        )
      } finally {
        this.端口 = undefined
      }
    }
    if (错误们.length > 0) throw new AggregateError(错误们, '关闭 Android WebView 会话失败')
  }

  private async 获得页面(): Promise<Page> {
    if (this.已关闭) throw new Error('Android WebView 会话已关闭')
    this.取消信号.throwIfAborted()
    await this.确认前台()
    this.打开任务 ??= this.连接().catch((错误: unknown): never => {
      this.打开任务 = undefined
      throw 错误
    })
    let 页面 = await this.打开任务
    if (页面.isClosed()) {
      // 整页换文档（如跳到 /terms/）后 WebView 可能换了新的页面对象：从已有连接里重新找当前的测试页面，连接断了就重连
      页面 = await this.重新选择页面()
      this.打开任务 = Promise.resolve(页面)
    }
    await this.检查页面(页面)
    return 页面
  }

  private async 重新选择页面(): Promise<Page> {
    let 浏览器 = this.浏览器
    if (浏览器 === undefined || 浏览器.isConnected() === false) {
      await this.释放资源()
      return await this.连接()
    }
    let 页面们 = 浏览器
      .contexts()
      .flatMap((上下文) => 上下文.pages())
      .filter((页面) => 页面.isClosed() === false && this.是测试页面(页面))
    // 新旧页面短暂并存时取最后出现的
    let 页面 = 页面们.at(-1)
    if (页面 === undefined) throw new Error('Android 换文档后找不到当前的测试 WebView 页面')
    return 页面
  }

  private async 连接(): Promise<Page> {
    let PID输出 = (await 执行ADB(['-s', this.设备序号, 'shell', 'pidof', this.应用包名], this.取消信号))
      .toString('utf8')
      .trim()
    if (/^[1-9]\d*$/u.test(PID输出) === false) throw new Error('无法确定唯一的 Android 测试应用进程')
    let 端口输出 = (
      await 执行ADB(
        ['-s', this.设备序号, 'forward', 'tcp:0', `localabstract:webview_devtools_remote_${PID输出}`],
        this.取消信号,
      )
    )
      .toString('utf8')
      .trim()
    if (/^[1-9]\d{0,4}$/u.test(端口输出) === false || Number(端口输出) > 65535)
      throw new Error('ADB 没有返回有效的 WebView 转发端口')
    this.端口 = Number(端口输出)
    try {
      this.浏览器 = await chromium.connectOverCDP(`http://127.0.0.1:${端口输出}`, { timeout: 10_000 })
      this.取消信号.throwIfAborted()
      if (this.已关闭) throw new Error('Android WebView 会话正在关闭')
      let 页面们 = this.浏览器
        .contexts()
        .flatMap((上下文) => 上下文.pages())
        .filter((页面) => this.是测试页面(页面))
      if (页面们.length !== 1) throw new Error(`Android 测试 WebView 页面数量不是 1：${String(页面们.length)}`)
      let 页面 = 页面们[0]
      if (页面 === undefined) throw new Error('Android 测试 WebView 页面不存在')
      return 页面
    } catch (错误) {
      try {
        await this.释放资源()
      } catch (清理错误) {
        throw new AggregateError([错误, 清理错误], 'Android WebView 连接及清理失败')
      }
      throw 错误
    }
  }

  private async 检查页面(页面: Page): Promise<void> {
    this.取消信号.throwIfAborted()
    if (this.已关闭 || 页面.isClosed() || this.是测试页面(页面) === false)
      throw new Error('Android 测试 WebView 页面已关闭或地址发生变化')
    await this.确认前台()
  }

  private 是测试页面(页面: Page): boolean {
    let 地址 = 页面.url()
    return URL.canParse(地址) && new URL(地址).origin === this.允许网页来源
  }

  private 定位(页面: Page, 目标: 网页目标): Locator {
    switch (目标.按) {
      case '网页文字':
        return 页面.getByText(目标.值, { exact: true })
      case '网页选择器':
        return 页面.locator(`css=${目标.值}`)
    }
  }
}
