import { chromium, expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { AsyncLocalStorage } from 'node:async_hooks'
import { addAbortListener } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

import { 测试提示卡片 } from './prompt-card'
import { 标注截图 } from './screenshot'
import { 浏览器步骤证据记录器, type 浏览器步骤证据配置 } from './step-evidence'
import type { 人工核验结果, 浏览器测试作用域配置, 浏览器测试参数, 浏览器测试模式 } from './types'

type 浏览器测试会话 = {
  引擎: 浏览器测试引擎
  收集附件: () => Promise<readonly { 名称: string; 路径: string; 内容类型: string }[]>
  关闭: () => Promise<void>
}

/**
 * 浏览器测试引擎代表围绕一个页面开展的一次浏览器测试会话。
 * 会话包含固定的运行模式、独立的步骤作用域，以及向观察者展示的提示卡片。
 * 它执行页面操作和可复用步骤，并按模式提供说明、高亮与人工核验。
 */
export class 浏览器测试引擎 {
  public static async 打开会话(参数: {
    服务地址: string
    初始地址?: string
    附件目录: string
    模式?: 浏览器测试模式
    取消信号?: AbortSignal
  }): Promise<浏览器测试会话> {
    let 模式 = z.enum(['自动', '演示']).parse(参数.模式 ?? '自动')
    let 取消信号 = 参数.取消信号
    取消信号?.throwIfAborted()
    await mkdir(参数.附件目录, { recursive: true })
    let 浏览器 = await chromium.launch({ headless: 模式 === '自动', handleSIGINT: 取消信号 === undefined })
    let 浏览器上下文: BrowserContext | undefined
    let 关闭任务: Promise<void> | undefined
    let 取消监听: ReturnType<typeof addAbortListener> | undefined
    let 释放资源 = async (): Promise<void> => {
      取消监听?.[Symbol.dispose]()
      try {
        await 浏览器上下文?.close()
      } finally {
        await 浏览器.close()
      }
    }
    let 关闭 = (): Promise<void> => (关闭任务 ??= 释放资源())
    try {
      取消信号?.throwIfAborted()
      let 上下文 = await 浏览器.newContext({ baseURL: 参数.服务地址 })
      浏览器上下文 = 上下文
      取消信号?.throwIfAborted()
      if (取消信号 !== undefined) {
        取消监听 = addAbortListener(取消信号, (): void => {
          // 错误由调用方在等待同一个关闭任务时处理。
          void 关闭().catch((): void => {})
        })
      }
      上下文.setDefaultTimeout(30_000)
      await 上下文.tracing.start({ screenshots: true, snapshots: true, sources: true })
      let 页面 = await 上下文.newPage()
      let 引擎 = new 浏览器测试引擎({ 页面, 模式, ...(取消信号 === undefined ? {} : { 取消信号 }) })
      if (参数.初始地址 !== undefined) await 引擎.导航(参数.初始地址)
      取消信号?.throwIfAborted()
      return {
        引擎,
        关闭,
        收集附件: async (): ReturnType<浏览器测试会话['收集附件']> => {
          let 截图路径 = join(参数.附件目录, 'final-page.png')
          let 追踪路径 = join(参数.附件目录, 'browser-trace.zip')
          await 页面.screenshot({ path: 截图路径, fullPage: true, timeout: 5_000 })
          await 上下文.tracing.stop({ path: 追踪路径 })
          return [
            { 名称: '最终页面截图', 路径: 截图路径, 内容类型: 'image/png' },
            { 名称: '浏览器追踪', 路径: 追踪路径, 内容类型: 'application/zip' },
          ]
        },
      }
    } catch (错误) {
      try {
        await 关闭()
      } catch (关闭错误) {
        throw new AggregateError([错误, 关闭错误], '打开浏览器测试会话失败，且释放资源时发生错误')
      }
      throw 错误
    }
  }

  private 页面: Page
  private 模式: 浏览器测试模式
  private 等待人工: (() => void) | undefined
  private 提示卡片: 测试提示卡片
  private 证据: 浏览器步骤证据记录器
  private 步骤作用域 = new AsyncLocalStorage<浏览器测试作用域配置>()

  public constructor(参数: 浏览器测试参数) {
    if (参数.页面.isClosed() === true) throw new Error('浏览器测试页面已关闭')
    this.页面 = 参数.页面
    this.模式 = z.enum(['自动', '演示']).parse(参数.模式)
    this.等待人工 = 参数.等待人工
    this.提示卡片 = new 测试提示卡片(参数.页面)
    this.证据 = new 浏览器步骤证据记录器(参数.页面, 参数.取消信号)
  }

  public get 断言(): typeof expect {
    return expect
  }

  public async 记录步骤证据<T>(配置: 浏览器步骤证据配置, 执行: () => Promise<T>): Promise<T> {
    return await this.证据.运行(配置, 执行)
  }

  public async 验证可见(
    目标: Locator,
    参数?: Parameters<ReturnType<typeof expect<Locator>>['toBeVisible']>[0],
  ): Promise<void> {
    await expect(目标).toBeVisible(参数)
    if (this.证据.启用 === true && 目标.page() === this.页面) await this.证据.采集('断言通过', '目标已可见', 目标)
  }

  public async 验证隐藏(
    目标: Locator,
    参数?: Parameters<ReturnType<typeof expect<Locator>>['toBeHidden']>[0],
  ): Promise<void> {
    await expect(目标).toBeHidden(参数)
    if (this.证据.启用 === true && 目标.page() === this.页面) await this.证据.采集('断言通过', '目标已隐藏')
  }

  public async 导航(地址: string, 参数?: Parameters<Page['goto']>[1]): ReturnType<Page['goto']> {
    this.检查页面()
    let 结果 = await this.页面.goto(地址, 参数)
    this.证据.标记已导航()
    if (this.证据.启用 === true) await this.证据.采集('导航完成', '导航完成后的页面')
    return 结果
  }

  public 获得地址(): string {
    this.检查页面()
    return this.页面.url()
  }

  public async 等待地址(
    地址: Parameters<Page['waitForURL']>[0],
    参数?: Parameters<Page['waitForURL']>[1],
  ): Promise<void> {
    this.检查页面()
    await this.页面.waitForURL(地址, 参数)
    if (this.证据.启用 === true) await this.证据.采集('等待达成', '已到达预期地址')
  }

  public 按角色(角色: Parameters<Page['getByRole']>[0], 参数?: Parameters<Page['getByRole']>[1]): Locator {
    this.检查页面()
    return this.页面.getByRole(角色, 参数)
  }

  public 按文本(文本: Parameters<Page['getByText']>[0], 参数?: Parameters<Page['getByText']>[1]): Locator {
    this.检查页面()
    return this.页面.getByText(文本, 参数)
  }

  public 按标签(标签: Parameters<Page['getByLabel']>[0], 参数?: Parameters<Page['getByLabel']>[1]): Locator {
    this.检查页面()
    return this.页面.getByLabel(标签, 参数)
  }

  public 定位(选择器: string, 参数?: Parameters<Page['locator']>[1]): Locator {
    this.检查页面()
    return this.页面.locator(选择器, 参数)
  }

  public 视口大小(): ReturnType<Page['viewportSize']> {
    this.检查页面()
    return this.页面.viewportSize()
  }

  /** 截取当前视口，可标注视口坐标或目标元素可见区域的中心。 */
  public async 截图(标注?: Locator | { x: number; y: number }): Promise<Buffer> {
    this.检查页面()
    if (标注 === undefined) return await this.页面.screenshot({ scale: 'css' })
    if ('x' in 标注) return await 标注截图(this.页面, await this.页面.screenshot({ scale: 'css' }), 标注)

    this.检查操作目标(标注)
    await this.滚动到目标(标注)
    let 区域 = await 标注.boundingBox()
    if (区域 === null) throw new Error('截图标注目标不可见')
    return await 标注截图(this.页面, await this.页面.screenshot({ scale: 'css' }), 区域)
  }

  public async 添加初始化脚本(脚本: () => void): Promise<void> {
    this.检查页面()
    await this.页面.addInitScript(脚本)
  }

  public async 按键(键: string, 参数?: Parameters<Page['keyboard']['press']>[1]): Promise<void> {
    this.检查页面()
    await this.页面.keyboard.press(键, 参数)
  }

  public async 点击坐标(
    水平位置: number,
    垂直位置: number,
    参数?: Parameters<Page['mouse']['click']>[2],
  ): Promise<void> {
    this.检查页面()
    if (this.证据.启用 === true) await this.证据.采集('操作前', '点击坐标前', { x: 水平位置, y: 垂直位置 })
    await this.页面.mouse.click(水平位置, 垂直位置, 参数)
  }

  public async 开场(说明: string, 标题?: string): Promise<void> {
    this.检查页面()
    this.检查文本(说明, '开场说明')
    if (标题 !== undefined) this.检查文本(标题, '开场标题')
    if (this.模式 === '自动') return
    this.等待人工?.()
    await this.提示卡片.展示({ 阶段: '开场', 说明, ...(标题 === undefined ? {} : { 标题 }) })
  }

  public async 说明(说明: string, 目标?: Locator): Promise<void> {
    this.检查页面()
    this.检查文本(说明, '步骤说明')
    if (this.证据.启用 === true) this.证据.记录说明(说明, 目标, this.步骤作用域.getStore())
    if (this.模式 === '自动' || this.步骤作用域.getStore()?.跳过步骤说明 === true) return
    if (目标 !== undefined) {
      this.检查操作目标(目标)
      await this.滚动到目标(目标)
    }
    this.等待人工?.()
    await this.提示卡片.展示({ 阶段: '步骤', 说明 })
  }

  public async 完成(说明: string): Promise<void> {
    this.检查页面()
    this.检查文本(说明, '完成说明')
    if (this.模式 === '自动') return
    this.等待人工?.()
    await this.提示卡片.展示({ 阶段: '完成', 说明 })
  }

  public async 确认(说明: string): Promise<人工核验结果> {
    this.检查页面()
    this.检查文本(说明, '人工核验说明')
    if (this.模式 === '自动') throw new Error(`人工核验只能在演示模式下进行。\n提示内容: ${说明}`)
    this.等待人工?.()
    return await this.提示卡片.核验(说明)
  }

  public async 步骤<T>(描述: string, 执行: () => Promise<T>): Promise<T> {
    await this.说明(描述)
    return await 执行()
  }

  public async 作用域<T>(配置: 浏览器测试作用域配置, 执行: () => Promise<T>): Promise<T> {
    this.检查页面()
    this.检查文本(配置.粒度, '作用域粒度')
    let 外层 = this.步骤作用域.getStore()
    let 当前: 浏览器测试作用域配置 = {
      粒度: 配置.粒度,
      跳过步骤说明: 配置.跳过步骤说明 ?? 外层?.跳过步骤说明 ?? false,
      跳过操作动画: 配置.跳过操作动画 ?? 外层?.跳过操作动画 ?? false,
    }
    if (配置.进入说明 !== undefined) await this.说明(配置.进入说明)
    return await this.步骤作用域.run(当前, 执行)
  }

  public async 点击(目标: Locator, 参数?: Parameters<Locator['click']>[0]): Promise<void> {
    await this.操作动画(目标, 'rgb(255, 0, 0)', 参数?.timeout)
    if (参数?.trial !== true && this.证据.启用 === true)
      await this.证据.采集('操作前', '点击目标前', 目标, { 作用域: this.步骤作用域.getStore() })
    await 目标.click(参数)
  }

  public async 输入(目标: Locator, 文本: string, 参数?: Parameters<Locator['fill']>[1]): Promise<void> {
    await this.操作动画(目标, 'rgb(0, 85, 255)', 参数?.timeout)
    if (this.证据.启用 === true) await this.证据.采集('操作前', '填写输入框前', 目标)
    await 目标.fill(文本, 参数)
    await this.操作后等待()
  }

  public async 勾选(目标: Locator, 参数?: Parameters<Locator['check']>[0]): Promise<void> {
    await this.操作动画(目标, 'rgb(255, 165, 0)', 参数?.timeout)
    if (参数?.trial !== true && this.证据.启用 === true) await this.证据.采集('操作前', '勾选目标前', 目标)
    await 目标.check(参数)
  }

  public async 选择(
    目标: Locator,
    选项: Parameters<Locator['selectOption']>[0],
    参数?: Parameters<Locator['selectOption']>[1],
  ): Promise<string[]> {
    await this.操作动画(目标, 'rgb(0, 200, 0)', 参数?.timeout)
    if (this.证据.启用 === true) await this.证据.采集('操作前', '选择选项前', 目标)
    let 结果 = await 目标.selectOption(选项, 参数)
    await this.操作后等待()
    return 结果
  }

  private 检查页面(): void {
    if (this.页面.isClosed() === true) throw new Error('浏览器测试页面已关闭')
  }

  private 检查文本(文本: string, 名称: string): void {
    if (文本.trim() === '') throw new Error(`${名称}不能为空`)
  }

  private 检查操作目标(目标: Locator): void {
    this.检查页面()
    if (目标.page() !== this.页面) throw new Error('操作目标不属于当前浏览器测试页面')
  }

  private async 滚动到目标(目标: Locator, 超时?: number): Promise<void> {
    let 参数 = 超时 === undefined ? undefined : { timeout: 超时 }
    try {
      await 目标.scrollIntoViewIfNeeded(参数)
    } catch (错误) {
      // 滚动等待布局稳定时，组件重渲染可能替换已定位的元素。
      if (
        错误 instanceof Error === false ||
        错误.message.startsWith('locator.scrollIntoViewIfNeeded: Element is not attached to the DOM') === false
      )
        throw 错误
      await 目标.scrollIntoViewIfNeeded(参数)
    }
  }

  private async 操作动画(目标: Locator, 颜色: string, 超时: number | undefined): Promise<void> {
    this.检查操作目标(目标)
    if (this.模式 === '自动') return
    await this.滚动到目标(目标, 超时)
    if (this.步骤作用域.getStore()?.跳过操作动画 === true) return
    await 目标.evaluate((元素, 高亮颜色): void => {
      let 位置 = 元素.getBoundingClientRect()
      let 边框 = document.createElement('div')
      边框.style.position = 'fixed'
      边框.style.left = `${String(位置.left)}px`
      边框.style.top = `${String(位置.top)}px`
      边框.style.width = `${String(位置.width)}px`
      边框.style.height = `${String(位置.height)}px`
      边框.style.border = `4px solid ${高亮颜色}`
      边框.style.boxShadow = `0 0 15px ${高亮颜色}`
      边框.style.borderRadius = '4px'
      边框.style.zIndex = '999998'
      边框.style.pointerEvents = 'none'
      边框.style.transition = 'all 0.3s'

      let 光标 = document.createElement('div')
      光标.style.position = 'fixed'
      光标.style.left = `${String(位置.left + 位置.width / 2)}px`
      光标.style.top = `${String(位置.top + 位置.height / 2)}px`
      光标.style.width = '30px'
      光标.style.height = '30px'
      光标.style.borderRadius = '50%'
      光标.style.background = 高亮颜色.replace(')', ', 0.4)').replace('rgb', 'rgba')
      光标.style.zIndex = '999999'
      光标.style.pointerEvents = 'none'
      光标.style.transform = 'translate(-50%, -50%) scale(2)'
      光标.style.transition = 'transform 0.3s ease-out'
      document.body.append(边框, 光标)
      requestAnimationFrame((): void => {
        光标.style.transform = 'translate(-50%, -50%) scale(1)'
      })
      setTimeout((): void => {
        边框.remove()
        光标.remove()
      }, 800)
    }, 颜色)
    await 目标.page().waitForTimeout(800)
  }

  private async 操作后等待(): Promise<void> {
    if (this.模式 === '自动' || this.步骤作用域.getStore()?.跳过操作动画 === true) return
    await this.页面.waitForTimeout(400)
  }
}
