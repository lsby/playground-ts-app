import type { Page } from '@playwright/test'

export type 浏览器测试模式 = '自动' | '演示'

export type 浏览器测试参数 = {
  页面: Page
  模式: 浏览器测试模式
  /** 通知宿主调整人工等待的超时；不负责提供核验结果。 */
  等待人工?: () => void
}

export type 浏览器测试作用域配置 = {
  /** 由调用方定义的观察层级，框架不解析其含义。 */
  粒度: string
  跳过步骤说明?: boolean
  跳过操作动画?: boolean
  进入说明?: string
}

export type 人工核验结果 = { 通过: boolean; 附加说明?: string }

export type 提示卡片阶段 = '开场' | '步骤' | '完成' | '确认'

export type 提示卡片参数 = { 阶段: 提示卡片阶段; 说明: string; 标题?: string }
