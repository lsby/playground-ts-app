import type { Page } from '@playwright/test'

export type 浏览器测试模式 = '自动' | '演示'

export type 浏览器测试参数 = { 页面: Page; 模式: 浏览器测试模式; 取消信号?: AbortSignal }

export type 浏览器测试作用域配置 = {
  /** 由调用方定义的观察层级，框架不解析其含义。 */
  粒度: string
  跳过步骤说明?: boolean
  跳过操作动画?: boolean
  进入说明?: string
}

export type 浏览器步骤证据 = {
  阶段: '导航完成' | '操作前' | '等待达成' | '断言通过' | '步骤结束' | '失败现场'
  名称: string
  图片: Buffer
}

export type 提示卡片阶段 = '开场' | '步骤' | '完成'

export type 提示卡片参数 = { 阶段: 提示卡片阶段; 说明: string; 标题?: string }
