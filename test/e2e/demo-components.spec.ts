import { expect, Page, test } from '@playwright/test'
import { cleanDB } from '../../scripts/db/clean-db'
import { kysely管理器 } from '../../src/global/global'
import { init } from '../../src/init/init'

async function 登录演示页(page: Page): Promise<void> {
  await page.goto('/demo/login.html')
  await page.getByRole('textbox', { name: '用户名' }).fill('admin')
  await page.getByRole('textbox', { name: '密码' }).fill('123456')
  await page.getByRole('button', { name: '登录演示系统' }).click()
  await page.waitForURL('**/demo/index.html')
}

async function 切换演示标签(page: Page, 标签: string): Promise<void> {
  await page.getByRole('button', { name: 标签, exact: true }).click()
}

test.describe('演示组件 E2E', (): void => {
  test.beforeEach(async (): Promise<void> => {
    await cleanDB(kysely管理器.获得句柄())
    await init()
  })

  test('演示登录不依赖项目登录页', async ({ page }): Promise<void> => {
    await 登录演示页(page)
    await expect(page.getByRole('heading', { name: '可运行的组件示例' })).toBeVisible()
    await expect(page).toHaveURL(/\/demo\/index\.html$/)
  })

  test('首次进入只显示默认标签内容', async ({ page }): Promise<void> => {
    await 登录演示页(page)
    await expect(page.getByRole('heading', { name: '按钮', exact: true })).toBeVisible()
    let 非默认标签标题列表 = ['强类型表单', '接口调用：加法', '浮层与反馈', '用户管理业务示例', 'Electron 能力']
    for (let 标题 of 非默认标签标题列表) {
      await expect(page.getByRole('heading', { name: 标题, exact: true })).toBeHidden()
    }
  })

  test('接口类型功能可以在演示中启用、获取和关闭', async ({ page }): Promise<void> => {
    await 登录演示页(page)
    await 切换演示标签(page, '数据与通信')
    await expect(page.getByRole('heading', { name: '接口类型导出', exact: true })).toHaveCount(1)
    await expect(page.getByRole('heading', { name: '系统接口类型获取演示', exact: true })).toHaveCount(0)
    let 获取按钮 = page.getByRole('button', { name: '获取接口类型', exact: true })
    await expect(获取按钮).toBeDisabled()
    await page.getByRole('button', { name: '启用接口类型获取', exact: true }).click()
    await expect(page.getByRole('button', { name: '关闭接口类型获取', exact: true })).toBeVisible()
    await expect(获取按钮).toBeEnabled()
    await 获取按钮.click()
    await expect(page.getByText('获取成功', { exact: true })).toBeVisible()
    await expect(page.getByText(/export type InterfaceType/)).toBeVisible()
    await page.getByRole('button', { name: '关闭接口类型获取', exact: true }).click()
    await expect(page.getByRole('button', { name: '启用接口类型获取', exact: true })).toBeVisible()
    await expect(获取按钮).toBeDisabled()
  })

  test('强类型表单显示校验并完成提交', async ({ page }): Promise<void> => {
    await page.addInitScript((): void => {
      Reflect.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined })
    })
    await 登录演示页(page)
    await 切换演示标签(page, '表单组件')
    await page.getByRole('button', { name: '验证并提交' }).click()
    await expect(page.getByRole('alert').filter({ hasText: '普通文本演示为必填项' })).toBeVisible()
    await page.getByRole('textbox', { name: '普通文本演示' }).fill('示例资料')
    await page.getByRole('spinbutton', { name: '数字输入演示' }).fill('3')
    await page.getByRole('combobox', { name: '下拉选择演示' }).selectOption('business')
    await page.getByRole('radio', { name: '紧凑' }).check()
    await page.getByRole('checkbox', { name: '复选框演示' }).check()
    await page.getByRole('checkbox', { name: '表格' }).check()
    let 多选下拉 = page.getByRole('combobox', { name: '多选下拉演示' })
    await 多选下拉.click()
    await page.getByText('前端', { exact: true }).click()
    await expect(多选下拉).toContainText('已选 1 项')
    await page.getByRole('switch', { name: '布尔开关演示' }).check()
    await page.getByRole('textbox', { name: '自动伸缩文本框演示' }).fill('多行文本示例')
    await page.getByRole('button', { name: '验证并提交' }).click()
    let 数据模态框 = page.getByRole('dialog', { name: '表单提交数据' })
    await expect(数据模态框).toBeVisible()
    await expect(数据模态框).toContainText('"name": "示例资料"')
    await expect(数据模态框).toContainText('"quantity": "3"')
    await expect(数据模态框).toContainText('"category": "business"')
    await expect(数据模态框).toContainText('"mode": "紧凑"')
    await expect(数据模态框).toContainText('"confirmed": true')
    await expect(数据模态框).toContainText('"frontend"')
    await expect(数据模态框).toContainText('"description": "多行文本示例"')
    await expect(数据模态框).toContainText('"switchDemo": true')
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(数据模态框).toBeHidden()
  })

  test('模态框可以最大化、还原和关闭', async ({ page }): Promise<void> => {
    await 登录演示页(page)
    await 切换演示标签(page, '浮层反馈')
    await page.getByRole('button', { name: '打开模态框' }).click()
    let 模态框 = page.getByRole('dialog').filter({ hasText: '模态框支持堆叠' })
    await expect(模态框).toBeVisible()

    let 原边界 = await 模态框.boundingBox()
    await page.getByRole('button', { name: '最大化' }).click()
    await expect(page.getByRole('button', { name: '还原' })).toBeVisible()
    let 最大化边界 = await 模态框.boundingBox()
    let 视口 = page.viewportSize()
    expect(原边界).not.toBeNull()
    expect(最大化边界).not.toBeNull()
    expect(视口).not.toBeNull()
    if (原边界 === null || 最大化边界 === null || 视口 === null) return
    expect(最大化边界.width).toBeCloseTo(视口.width, 0)
    expect(最大化边界.height).toBeCloseTo(视口.height, 0)

    await page.getByRole('button', { name: '还原' }).click()
    await expect(page.getByRole('button', { name: '最大化' })).toBeVisible()
    let 还原边界 = await 模态框.boundingBox()
    expect(还原边界).not.toBeNull()
    if (还原边界 === null) return
    expect(还原边界.width).toBeCloseTo(原边界.width, 0)
    expect(还原边界.height).toBeCloseTo(原边界.height, 0)

    await page.getByRole('button', { name: '关闭' }).click()
    await expect(模态框).toBeHidden()
  })

  test('未指定尺寸的模态框按内容自适应', async ({ page }): Promise<void> => {
    await 登录演示页(page)
    await 切换演示标签(page, '业务示例')
    await page.getByRole('button', { name: '添加数据' }).click()
    let 模态框 = page.getByRole('dialog', { name: '添加用户' })
    await expect(模态框).toBeVisible()
    let 边界 = await 模态框.boundingBox()
    let 视口 = page.viewportSize()
    expect(边界).not.toBeNull()
    expect(视口).not.toBeNull()
    if (边界 === null || 视口 === null) return
    expect(边界.width).toBeLessThanOrEqual(642)
    expect(边界.height).toBeLessThan(视口.height * 0.7)
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(模态框).toBeHidden()
  })

  test('表格多重排序显示方向和优先级', async ({ page }): Promise<void> => {
    await 登录演示页(page)
    await 切换演示标签(page, '业务示例')
    await page.getByRole('button', { name: 'ID', exact: true }).click()
    await expect(page.getByRole('button', { name: 'ID ▲0', exact: true })).toBeVisible()

    await page.getByRole('button', { name: '名称', exact: true }).click()
    await expect(page.getByRole('button', { name: 'ID ▲0', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '名称 ▲1', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'ID ▲0', exact: true }).click()
    await expect(page.getByRole('button', { name: 'ID ▼0', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '名称 ▲1', exact: true })).toBeVisible()
  })
})
