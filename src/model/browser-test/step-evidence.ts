import type { Locator, Page } from '@playwright/test'
import { AsyncLocalStorage } from 'node:async_hooks'

import { 标注截图, 获得视口内标注位置, type 截图标注坐标 } from './screenshot'
import type { 浏览器步骤证据, 浏览器测试作用域配置 } from './types'

export type 浏览器步骤证据配置 = { 提交: (证据: 浏览器步骤证据) => Promise<void>; 记录错误: (错误: unknown) => void }

type 步骤证据记录 = {
  配置: 浏览器步骤证据配置
  已结束: boolean
  已访问页面: boolean
  待用说明: { 文字: string; 目标: Locator; 作用域: 浏览器测试作用域配置 | undefined } | undefined
  最近结果原图: Buffer | undefined
}

async function 限制标注用时<T>(任务: Promise<T>): Promise<T> {
  let 定时器: ReturnType<typeof setTimeout> | undefined
  try {
    let 超时 = new Promise<never>((_完成, 拒绝): void => {
      定时器 = setTimeout((): void => 拒绝(new Error('自动截图标注超时')), 500)
    })
    return await Promise.race([任务, 超时])
  } finally {
    clearTimeout(定时器)
  }
}

/** 将绑定页面的实际画面记录到发起操作的测试步骤。 */
export class 浏览器步骤证据记录器 {
  private 作用域 = new AsyncLocalStorage<步骤证据记录>()
  private 已导航 = false

  public constructor(
    private 页面: Page,
    private 取消信号?: AbortSignal,
  ) {}

  public get 启用(): boolean {
    return this.作用域.getStore()?.已结束 === false && this.取消信号?.aborted !== true
  }

  public 标记已导航(): void {
    this.已导航 = true
  }

  public 记录说明(文字: string, 目标: Locator | undefined, 作用域: 浏览器测试作用域配置 | undefined): void {
    let 记录 = this.作用域.getStore()
    if (记录?.已结束 !== false) return
    记录.待用说明 = 目标 === undefined ? undefined : { 文字, 目标, 作用域 }
  }

  public async 运行<T>(配置: 浏览器步骤证据配置, 执行: () => Promise<T>): Promise<T> {
    let 记录: 步骤证据记录 = { 配置, 已结束: false, 已访问页面: false, 待用说明: undefined, 最近结果原图: undefined }
    return await this.作用域.run(记录, async (): Promise<T> => {
      try {
        let 结果 = await 执行()
        await this.采集('步骤结束', '步骤结束时的页面')
        return 结果
      } catch (错误) {
        await this.采集('失败现场', '步骤失败时的页面')
        throw 错误
      } finally {
        记录.已结束 = true
      }
    })
  }

  public async 采集(
    阶段: 浏览器步骤证据['阶段'],
    名称: string,
    目标?: Locator | 截图标注坐标,
    点击作用域?: { 作用域: 浏览器测试作用域配置 | undefined },
  ): Promise<void> {
    let 记录 = this.作用域.getStore()
    if (记录 === undefined || this.可以采集(记录) === false) return
    if (
      (阶段 === '步骤结束' || 阶段 === '失败现场') &&
      记录.已访问页面 === false &&
      this.已导航 === false &&
      this.页面.url() === 'about:blank'
    )
      return

    记录.已访问页面 = true
    let 说明 = 记录.待用说明
    记录.待用说明 = undefined
    if (点击作用域 !== undefined && 说明 !== undefined && 说明.目标 === 目标 && 说明.作用域 === 点击作用域.作用域)
      名称 = 说明.文字
    if (阶段 === '操作前') 记录.最近结果原图 = undefined

    try {
      let 位置 = await this.获得标注位置(记录, 目标)
      if (this.可以采集(记录) === false) return
      let 原图 = await this.页面.screenshot({ scale: 'css', caret: 'initial', timeout: 1_500 })
      if (阶段 === '步骤结束' && 记录.最近结果原图?.equals(原图) === true) return
      let 图片 = await this.添加标注(记录, 原图, 位置)
      if (this.可以采集(记录) === false) return
      await 记录.配置.提交({ 阶段, 名称, 图片 })
      if (阶段 === '导航完成' || 阶段 === '等待达成' || 阶段 === '断言通过') 记录.最近结果原图 = 原图
    } catch (错误) {
      this.报告错误(记录, 错误)
    }
  }

  private 可以采集(记录: 步骤证据记录): boolean {
    return 记录.已结束 === false && this.取消信号?.aborted !== true && this.页面.isClosed() === false
  }

  private async 获得标注位置(
    记录: 步骤证据记录,
    目标: Locator | 截图标注坐标 | undefined,
  ): Promise<截图标注坐标 | undefined> {
    if (目标 === undefined || 'x' in 目标) return 目标
    if (目标.page() !== this.页面) return undefined
    try {
      return await 限制标注用时(获得视口内标注位置(目标))
    } catch (错误) {
      this.报告错误(记录, 错误)
      return undefined
    }
  }

  private async 添加标注(记录: 步骤证据记录, 原图: Buffer, 位置: 截图标注坐标 | undefined): Promise<Buffer> {
    if (位置 === undefined || this.可以采集(记录) === false) return 原图
    try {
      return await 限制标注用时(标注截图(this.页面, 原图, 位置))
    } catch (错误) {
      this.报告错误(记录, 错误)
      return 原图
    }
  }

  private 报告错误(记录: 步骤证据记录, 错误: unknown): void {
    try {
      记录.配置.记录错误(错误)
    } catch {
      // 取证及诊断均不能改变原步骤结果。
    }
  }
}
