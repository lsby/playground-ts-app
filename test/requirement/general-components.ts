import { 流程, 行为, 观察, 需求, 需求测试, 验收点, type 需求测试工具 } from '../../src/model/test-requirement'
import { 切换演示标签, 登录演示页 } from './helper/browser-demo-helper'

/**
 * 验证通用扩展组件的页面交互。
 * 准备演示账号后检查反馈、日期、人员选择、上传、抽屉与折叠面板。
 */
type 测试上下文 = { 工具: 需求测试工具 }

let 页面反馈 = new 验收点({ 描述: '页面提示可以关闭，完成状态和空状态可见。', 验收手段: '自动' })
let 输入与上传 = new 验收点({ 描述: '日期时间和人员选择正确回显，文件上传完成后进度达到 100%。', 验收手段: '自动' })
let 面板交互 = new 验收点({ 描述: '折叠面板可以切换，详情抽屉打开时屏蔽背景并可以关闭。', 验收手段: '自动' })
let 业务需求 = new 需求({
  名称: '通用组件输入与反馈',
  描述: '扩展组件演示页展示提示、数据输入、文件上传、折叠面板和详情抽屉的基本用法。',
  验收点们: [页面反馈, 输入与上传, 面板交互],
})

class 通用扩展组件测试 extends 需求测试 {
  private static 获得主流程步骤(): (行为<测试上下文> | 观察<测试上下文>)[] {
    return [
      new 行为<测试上下文>('登录并打开扩展组件示例', async (当前状态): Promise<测试上下文> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        await 引擎.导航('/demo/login.html')
        await 引擎.开场(
          '【测试用例】通用扩展组件\n验证反馈状态、日期时间、异步搜索、文件上传、抽屉及折叠面板的核心交互。',
        )
        await 登录演示页(引擎)
        await 切换演示标签(引擎, '扩展组件')
        return 当前状态
      }),
      new 行为<测试上下文>('检查并关闭页面提示', async (当前状态): Promise<测试上下文> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        let 页面内提示 = 引擎.按角色('alert').filter({ hasText: '用于展示需要关注的页面内消息' })
        await 引擎.验证可见(页面内提示)
        await 引擎.点击(页面内提示.getByRole('button', { name: '关闭', exact: true }))
        await 引擎.验证隐藏(页面内提示)
        await 引擎.验证可见(引擎.按角色('heading', { name: '操作已完成' }))
        await 引擎.验证可见(引擎.按角色('heading', { name: '暂无数据' }))
        return 当前状态
      }),
      new 行为<测试上下文>('填写日期时间并检查结果', async (当前状态): Promise<测试上下文> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        let 日期时间 = 引擎.按标签('本地执行时间')
        await 引擎.输入(日期时间, '2026-09-13T11:45')
        await 日期时间.press('Tab')
        await 引擎.验证可见(引擎.按文本(/UTC：2026-09-13T/))
        await 引擎.断言(引擎.按标签('统计日期开始')).toHaveValue('2026-09-01')
        await 引擎.断言(引擎.按标签('统计日期结束')).toHaveValue('2026-09-12')
        return 当前状态
      }),
      new 行为<测试上下文>('搜索并选择负责人', async (当前状态): Promise<测试上下文> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        let 负责人 = 引擎.按角色('combobox', { name: '负责人' })
        await 引擎.输入(负责人, '李')
        await 引擎.验证可见(引擎.按角色('option', { name: '李四', exact: true }))
        await 负责人.press('ArrowDown')
        await 负责人.press('Enter')
        await 引擎.验证可见(引擎.按文本('已选负责人：li-si', { exact: true }))
        await 引擎.断言(负责人).toHaveValue('李四')
        return 当前状态
      }),
      new 行为<测试上下文>('选择并上传文件', async (当前状态): Promise<测试上下文> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        let 文件选择器 = 引擎.定位('lsby-file-picker')
        let 文件输入 = 文件选择器.locator('input[type="file"]')
        await 文件输入.setInputFiles({ name: 'demo.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
        await 引擎.验证可见(文件选择器.getByText('demo.txt', { exact: true }))
        await 引擎.点击(文件选择器.getByRole('button', { name: '开始上传' }))
        await 引擎.断言(文件选择器.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
        await 引擎.验证可见(文件选择器.getByText('文件上传完成', { exact: true }))
        return 当前状态
      }),
      new 行为<测试上下文>('切换折叠面板', async (当前状态): Promise<测试上下文> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        let 基础配置按钮 = 引擎.按角色('button', { name: '基础配置', exact: true })
        let 高级配置按钮 = 引擎.按角色('button', { name: '高级配置', exact: true })
        await 引擎.断言(基础配置按钮).toHaveAttribute('aria-expanded', 'true')
        await 引擎.点击(高级配置按钮)
        await 引擎.断言(基础配置按钮).toHaveAttribute('aria-expanded', 'false')
        await 引擎.断言(高级配置按钮).toHaveAttribute('aria-expanded', 'true')
        await 引擎.验证可见(引擎.按文本('高级配置内容', { exact: true }))
        return 当前状态
      }),
      new 行为<测试上下文>('打开并关闭详情抽屉', async (当前状态): Promise<测试上下文> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        await 引擎.点击(引擎.按角色('button', { name: '打开详情抽屉' }))
        let 抽屉 = 引擎.按角色('dialog', { name: '详情抽屉' })
        await 引擎.验证可见(抽屉)
        await 引擎.断言(引擎.定位('body > lsby-demo-app')).toHaveJSProperty('inert', true)
        await 引擎.点击(引擎.按角色('button', { name: '关闭抽屉' }))
        return 当前状态
      }),
      new 观察<测试上下文>('检查详情抽屉已关闭', async (当前状态): Promise<void> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        let 抽屉 = 引擎.按角色('dialog', { name: '详情抽屉' })
        await 引擎.验证隐藏(抽屉)
        await 引擎.完成('通用扩展组件验证完成。')
      }),
    ]
  }
  public constructor() {
    super(
      [业务需求],
      [
        new 流程({
          名称: '操作提示、输入、上传与详情抽屉',
          测试思路: '逐项操作扩展组件，通过页面回显、上传进度和控件状态核对结果，最后确认抽屉关闭。',
          步骤们: 通用扩展组件测试.获得主流程步骤(),
          覆盖验收点们: [页面反馈, 输入与上传, 面板交互],
        }),
      ],
      { 使用测试服务: true },
    )
  }

  protected override async 准备数据(工具: 需求测试工具): Promise<object> {
    await 工具.浏览器.打开('主会话')
    return {}
  }
}

export default 通用扩展组件测试
