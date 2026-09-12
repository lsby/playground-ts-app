import { expect, Page, test } from '@playwright/test'
import { cleanDB } from '../../scripts/db/clean-db'
import { kysely管理器 } from '../../src/global/global'
import { init } from '../../src/init/init'
import { 演示_完成, 演示_开场, 演示_点击, 演示_输入 } from '../../src/model/test-interactive'

async function 进入扩展组件页(page: Page): Promise<void> {
  await page.goto('/demo/login.html')
  await 演示_输入(page.getByRole('textbox', { name: '用户名' }), 'admin')
  await 演示_输入(page.getByRole('textbox', { name: '密码' }), '123456')
  await 演示_点击(page.getByRole('button', { name: '登录演示系统' }))
  await page.waitForURL('**/demo/index.html')
  await 演示_点击(page.getByRole('tab', { name: '扩展组件', exact: true }))
}

test.describe('通用扩展组件 E2E', (): void => {
  test.beforeEach(async (): Promise<void> => {
    await cleanDB(kysely管理器.获得句柄())
    await init()
  })

  test('反馈、选择、上传、抽屉与折叠组件协同工作', async ({ page }): Promise<void> => {
    await page.goto('/demo/login.html')
    await 演示_开场(
      page,
      '【测试用例】通用扩展组件\n验证反馈状态、日期时间、异步搜索、文件上传、抽屉及折叠面板的核心交互。',
    )
    await 进入扩展组件页(page)

    let 页面内提示 = page.getByRole('alert').filter({ hasText: '用于展示需要关注的页面内消息' })
    await expect(页面内提示).toBeVisible()
    await 演示_点击(页面内提示.getByRole('button', { name: '关闭', exact: true }))
    await expect(页面内提示).toBeHidden()
    await expect(page.getByRole('heading', { name: '操作已完成' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '暂无数据' })).toBeVisible()

    let 日期时间 = page.getByLabel('本地执行时间')
    await 日期时间.fill('2026-09-13T11:45')
    await 日期时间.press('Tab')
    await expect(page.getByText(/UTC：2026-09-13T/)).toBeVisible()
    await expect(page.getByLabel('统计日期开始')).toHaveValue('2026-09-01')
    await expect(page.getByLabel('统计日期结束')).toHaveValue('2026-09-12')

    let 负责人 = page.getByRole('combobox', { name: '负责人' })
    await 演示_输入(负责人, '李')
    await expect(page.getByRole('option', { name: '李四', exact: true })).toBeVisible()
    await 负责人.press('ArrowDown')
    await 负责人.press('Enter')
    await expect(page.getByText('已选负责人：li-si', { exact: true })).toBeVisible()
    await expect(负责人).toHaveValue('李四')

    let 文件选择器 = page.locator('lsby-file-picker')
    let 文件输入 = 文件选择器.locator('input[type="file"]')
    await 文件输入.setInputFiles({ name: 'demo.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await expect(文件选择器.getByText('demo.txt', { exact: true })).toBeVisible()
    await 演示_点击(文件选择器.getByRole('button', { name: '开始上传' }))
    await expect(文件选择器.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
    await 演示_点击(文件选择器.getByRole('button', { name: '取消上传' }))
    await expect(文件选择器.getByText('文件上传已取消', { exact: true })).toBeVisible()
    await 演示_点击(文件选择器.getByRole('button', { name: '开始上传' }))
    await expect(文件选择器.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    await expect(文件选择器.getByText('文件上传完成', { exact: true })).toBeVisible()
    await 文件输入.setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('image') })
    await expect(文件选择器.getByRole('alert')).toContainText('类型不符合要求')

    let 基础配置按钮 = page.getByRole('button', { name: '基础配置', exact: true })
    let 高级配置按钮 = page.getByRole('button', { name: '高级配置', exact: true })
    await expect(基础配置按钮).toHaveAttribute('aria-expanded', 'true')
    await 演示_点击(高级配置按钮)
    await expect(基础配置按钮).toHaveAttribute('aria-expanded', 'false')
    await expect(高级配置按钮).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('高级配置内容', { exact: true })).toBeVisible()

    await 演示_点击(page.getByRole('button', { name: '打开详情抽屉' }))
    let 抽屉 = page.getByRole('dialog', { name: '详情抽屉' })
    await expect(抽屉).toBeVisible()
    await expect(page.locator('body > lsby-demo-app')).toHaveJSProperty('inert', true)
    await 演示_点击(page.getByRole('button', { name: '关闭抽屉' }))
    await expect(抽屉).toBeHidden()

    await 演示_完成(page, '通用扩展组件验证完成。')
  })
})
