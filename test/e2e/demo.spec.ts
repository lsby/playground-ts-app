import { expect, test } from '@playwright/test'
import { cleanDB } from '../../scripts/db/clean-db'
import { kysely管理器 } from '../../src/global/global'
import { init } from '../../src/init/init'
import { 演示_点击, 演示_说明, 演示_输入 } from './tools/demo-mode'

test.describe('基础登录 E2E 测试', (): void => {
  test.beforeEach(async (): Promise<void> => {
    let 数据库句柄 = kysely管理器.获得句柄()
    await cleanDB(数据库句柄)
    await init()
  })

  test('演示登录流程', async ({ page }): Promise<void> => {
    // 延长超时时间，以适应演示动画的耗时
    test.setTimeout(60000)

    await 演示_说明(page, '开始登录 E2E 测试')
    await page.goto('/login.html')

    await 演示_说明(page, '输入用户名 admin')
    await 演示_输入(page.locator('input[placeholder="请输入用户名"]').first(), 'admin')

    await 演示_说明(page, '输入密码 123456')
    await 演示_输入(page.locator('input[placeholder="请输入密码"]').first(), '123456')

    await 演示_说明(page, '点击登录按钮')
    await 演示_点击(page.getByRole('button', { name: '登录' }))

    // 等待跳转并判断是否登录成功
    await page.waitForURL('**/index.html')
    let 首页内容 = page.locator('lsby-index')
    await expect(首页内容).toBeVisible()
    await expect(page.getByText('你好世界')).toBeVisible()

    await 演示_说明(page, '登录成功，测试演示完成！')
  })
})
