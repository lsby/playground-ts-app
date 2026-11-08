import type { 浏览器测试引擎 } from '../../src/model/browser-test'
import { 端到端测试, type 端到端测试步骤 } from '../../src/model/test-e2e'
import { 准备演示数据 } from './helper/demo-test-helper'

/**
 * 验证通用扩展组件的页面交互。
 * 准备演示账号后检查反馈、日期、人员选择、上传、抽屉与折叠面板。
 */
class 通用扩展组件测试 extends 端到端测试 {
  public override async 准备数据(): Promise<void> {
    await 准备演示数据()
  }

  protected override 获得主流程步骤(): readonly 端到端测试步骤[] {
    return [
      {
        名称: '打开登录页并进入扩展组件',
        类型: '导航',
        执行: async (引擎): Promise<void> => {
          await 引擎.导航('/demo/login.html')
          await 引擎.开场(
            '【测试用例】通用扩展组件\n验证反馈状态、日期时间、异步搜索、文件上传、抽屉及折叠面板的核心交互。',
          )
          await this.进入扩展组件页(引擎)
        },
      },
      {
        名称: '检查并关闭页面提示',
        类型: '操作与断言',
        执行: async (引擎): Promise<void> => {
          let 页面内提示 = 引擎.按角色('alert').filter({ hasText: '用于展示需要关注的页面内消息' })
          await 引擎.验证可见(页面内提示)
          await 引擎.点击(页面内提示.getByRole('button', { name: '关闭', exact: true }))
          await 引擎.验证隐藏(页面内提示)
          await 引擎.验证可见(引擎.按角色('heading', { name: '操作已完成' }))
          await 引擎.验证可见(引擎.按角色('heading', { name: '暂无数据' }))
        },
      },
      {
        名称: '填写日期时间并检查结果',
        类型: '操作与断言',
        执行: async (引擎): Promise<void> => {
          let 日期时间 = 引擎.按标签('本地执行时间')
          await 引擎.输入(日期时间, '2026-09-13T11:45')
          await 日期时间.press('Tab')
          await 引擎.验证可见(引擎.按文本(/UTC：2026-09-13T/))
          await 引擎.断言(引擎.按标签('统计日期开始')).toHaveValue('2026-09-01')
          await 引擎.断言(引擎.按标签('统计日期结束')).toHaveValue('2026-09-12')
        },
      },
      {
        名称: '搜索并选择负责人',
        类型: '操作与断言',
        执行: async (引擎): Promise<void> => {
          let 负责人 = 引擎.按角色('combobox', { name: '负责人' })
          await 引擎.输入(负责人, '李')
          await 引擎.验证可见(引擎.按角色('option', { name: '李四', exact: true }))
          await 负责人.press('ArrowDown')
          await 负责人.press('Enter')
          await 引擎.验证可见(引擎.按文本('已选负责人：li-si', { exact: true }))
          await 引擎.断言(负责人).toHaveValue('李四')
        },
      },
      {
        名称: '选择并上传文件',
        类型: '操作与断言',
        执行: async (引擎): Promise<void> => {
          let 文件选择器 = 引擎.定位('lsby-file-picker')
          let 文件输入 = 文件选择器.locator('input[type="file"]')
          await 文件输入.setInputFiles({ name: 'demo.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
          await 引擎.验证可见(文件选择器.getByText('demo.txt', { exact: true }))
          await 引擎.点击(文件选择器.getByRole('button', { name: '开始上传' }))
          await 引擎.断言(文件选择器.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
          await 引擎.验证可见(文件选择器.getByText('文件上传完成', { exact: true }))
        },
      },
      {
        名称: '切换折叠面板',
        类型: '操作与断言',
        执行: async (引擎): Promise<void> => {
          let 基础配置按钮 = 引擎.按角色('button', { name: '基础配置', exact: true })
          let 高级配置按钮 = 引擎.按角色('button', { name: '高级配置', exact: true })
          await 引擎.断言(基础配置按钮).toHaveAttribute('aria-expanded', 'true')
          await 引擎.点击(高级配置按钮)
          await 引擎.断言(基础配置按钮).toHaveAttribute('aria-expanded', 'false')
          await 引擎.断言(高级配置按钮).toHaveAttribute('aria-expanded', 'true')
          await 引擎.验证可见(引擎.按文本('高级配置内容', { exact: true }))
        },
      },
      {
        名称: '打开并关闭详情抽屉',
        类型: '操作与断言',
        执行: async (引擎): Promise<void> => {
          await 引擎.点击(引擎.按角色('button', { name: '打开详情抽屉' }))
          let 抽屉 = 引擎.按角色('dialog', { name: '详情抽屉' })
          await 引擎.验证可见(抽屉)
          await 引擎.断言(引擎.定位('body > lsby-demo-app')).toHaveJSProperty('inert', true)
          await 引擎.点击(引擎.按角色('button', { name: '关闭抽屉' }))
          await 引擎.验证隐藏(抽屉)
          await 引擎.完成('通用扩展组件验证完成。')
        },
      },
    ]
  }

  private async 进入扩展组件页(引擎: 浏览器测试引擎): Promise<void> {
    await 引擎.导航('/demo/login.html')
    await 引擎.输入(引擎.按角色('textbox', { name: '用户名' }), 'admin')
    await 引擎.输入(引擎.按角色('textbox', { name: '密码' }), '123456')
    await 引擎.点击(引擎.按角色('button', { name: '登录演示系统' }))
    await 引擎.等待地址('**/demo/index.html')
    await 引擎.点击(引擎.按角色('tab', { name: '扩展组件', exact: true }))
  }
}

export default 通用扩展组件测试
