import { expect, Page, test } from '@playwright/test'
import { cleanDB } from '../../scripts/db/clean-db'
import { kysely管理器 } from '../../src/global/global'
import { init } from '../../src/init/init'
import {
  演示_作用域,
  演示_勾选,
  演示_完成,
  演示_开场,
  演示_点击,
  演示_说明_右下角,
  演示_输入,
  演示_选择,
} from '../../src/model/test-interactive'

type 用户表格行 = { id: string; 名称: string }

async function 登录演示页(page: Page): Promise<void> {
  if (page.url().includes('/demo/login.html') === false) {
    await page.goto('/demo/login.html')
  }
  await 演示_说明_右下角(page, '正在进入演示系统登录页，准备执行自动登录')
  await 演示_输入(page.getByRole('textbox', { name: '用户名' }), 'admin')
  await 演示_输入(page.getByRole('textbox', { name: '密码' }), '123456')
  await 演示_点击(page.getByRole('button', { name: '登录演示系统' }))
  await page.waitForURL('**/demo/index.html')
}

async function 切换演示标签(page: Page, 标签: string): Promise<void> {
  await 演示_说明_右下角(page, `切换演示标签页至：“${标签}”`)
  await 演示_点击(page.getByRole('tab', { name: 标签, exact: true }))
}

async function 添加演示用户(page: Page, 用户名: string): Promise<void> {
  await 演示_点击(page.getByRole('button', { name: '添加数据' }))
  await 演示_输入(page.getByRole('textbox', { name: '用户名' }), 用户名)
  await 演示_输入(page.getByRole('textbox', { name: '密码' }), 'sort-password')
  await 演示_点击(page.getByRole('button', { name: '确认', exact: true }))
  await expect(page.getByRole('cell', { name: 用户名, exact: true })).toBeVisible()
}

async function 读取用户表格行(page: Page): Promise<用户表格行[]> {
  await expect(page.getByRole('table')).toHaveAttribute('aria-busy', 'false')
  let 行列表 = page.getByRole('row').filter({ has: page.getByRole('button', { name: '编辑', exact: true }) })
  let 行数量 = await 行列表.count()
  let 结果: 用户表格行[] = []
  for (let 索引 = 0; 索引 < 行数量; 索引 += 1) {
    let 单元格列表 = 行列表.nth(索引).getByRole('cell')
    let id = (await 单元格列表.nth(0).textContent())?.trim()
    let 名称 = (await 单元格列表.nth(1).textContent())?.trim()
    if (id === undefined || 名称 === undefined) throw new Error(`无法读取第 ${String(索引 + 1)} 行的用户数据`)
    结果.push({ id, 名称 })
  }
  return 结果
}

function 比较文本(左值: string, 右值: string): number {
  if (左值 < 右值) return -1
  if (左值 > 右值) return 1
  return 0
}

test.describe('演示组件 E2E', (): void => {
  test.beforeEach(async (): Promise<void> => {
    await cleanDB(kysely管理器.获得句柄())
    await init()
  })

  // 登录与核心组件概览（整合登录、默认标签展示、动态接口类型获取）
  test('演示系统登录与核心组件概览', async ({ page }): Promise<void> => {
    await page.goto('/demo/login.html')
    await 演示_开场(
      page,
      '【测试用例】系统登录与核心组件概览\n演示系统的独立运行能力、系统登录流程、默认基础组件展示以及数据通信层动态接口类型的获取与关闭。',
    )
    await 登录演示页(page)

    // 1. 验证登录后主页及默认标签
    await expect(page.getByRole('heading', { name: '可运行的组件示例' })).toBeVisible()
    await expect(page).toHaveURL(/\/demo\/index\.html$/)
    await expect(page.getByRole('heading', { name: '按钮', exact: true })).toBeVisible()

    let 非默认标签标题列表 = ['强类型表单', '接口调用：加法', '浮层与反馈', '用户管理业务示例', 'Electron 能力']
    for (let 标题 of 非默认标签标题列表) {
      await expect(page.getByRole('heading', { name: 标题, exact: true })).toBeHidden()
    }

    // 2. 切换到数据与通信标签，验证接口类型导出功能
    await 切换演示标签(page, '数据与通信')
    await expect(page.getByRole('heading', { name: '接口类型导出', exact: true })).toHaveCount(1)
    await expect(page.getByRole('heading', { name: '系统接口类型获取演示', exact: true })).toHaveCount(0)

    let 获取按钮 = page.getByRole('button', { name: '获取接口类型', exact: true })
    await expect(获取按钮).toBeDisabled()

    await 演示_说明_右下角(page, '点击“启用接口类型获取”按钮以激活获取功能')
    await 演示_点击(page.getByRole('button', { name: '启用接口类型获取', exact: true }))
    await expect(page.getByRole('button', { name: '关闭接口类型获取', exact: true })).toBeVisible()
    await expect(获取按钮).toBeEnabled()

    await 演示_说明_右下角(page, '点击“获取接口类型”，从服务端实时拉取 TypeScript 接口定义')
    await 演示_点击(获取按钮)
    await expect(page.getByText('获取成功', { exact: true })).toBeVisible()
    await expect(page.getByText(/export type InterfaceType/)).toBeVisible()

    await 演示_说明_右下角(page, '点击“关闭接口类型获取”，验证按钮状态重置为禁用')
    await 演示_点击(page.getByRole('button', { name: '关闭接口类型获取', exact: true }))
    await expect(page.getByRole('button', { name: '启用接口类型获取', exact: true })).toBeVisible()
    await expect(获取按钮).toBeDisabled()

    await 演示_完成(
      page,
      '系统登录与核心组件概览演示完成！\n已成功验证演示系统登录、默认基础视图渲染以及服务端接口类型实时获取机制。',
    )
  })

  // 强类型表单校验与多控件数据提交
  test('强类型表单校验与多控件数据提交', async ({ page }): Promise<void> => {
    await page.addInitScript((): void => {
      Reflect.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined })
    })
    await page.goto('/demo/login.html')

    // 1. 核心原则：开场在测试第一秒立刻居中出现
    await 演示_开场(
      page,
      '【测试用例】强类型表单校验与多控件数据提交\n展示表单前端非空校验反馈，并依次操作单选、复选、下拉选择、多选、开关及自动伸缩多行文本，最终完成结构化数据提交。',
    )

    // 2. 前置准备：仅显示一次进入说明，内部登录与切页不再重复展示说明和动画
    await 演示_作用域(
      {
        page,
        粒度: '表单现场准备',
        进入说明: '前置准备：自动登录演示系统并切换至表单组件现场',
        跳过步骤说明: true,
        跳过操作动画: true,
      },
      async () => {
        await 登录演示页(page)
        await 切换演示标签(page, '表单组件')
      },
    )

    // 3. 核心业务演示：到达现场后，恢复细致步骤引导
    // 1. 空表单校验
    await 演示_说明_右下角(page, '未填写必填项时直接点击“验证并提交”，验证前端表单校验拦截')
    await 演示_点击(page.getByRole('button', { name: '验证并提交' }))
    await expect(page.getByRole('alert').filter({ hasText: '普通文本演示为必填项' })).toBeVisible()

    let 表单 = page.locator('lsby-form')
    let 名称输入框 = page.getByRole('textbox', { name: '普通文本演示' })
    await 表单.evaluate((元素): void => {
      if ('设置初始数据' in 元素 === false || typeof 元素.设置初始数据 !== 'function')
        throw new Error('表单未提供设置初始数据方法')
      元素.设置初始数据({ name: '服务端初始值' })
    })
    await expect(名称输入框).toHaveValue('服务端初始值')
    await 名称输入框.fill('临时修改值')
    await 表单.evaluate((元素): void => {
      if ('重置' in 元素 === false || typeof 元素.重置 !== 'function') throw new Error('表单未提供重置方法')
      元素.重置()
    })
    await expect(名称输入框).toHaveValue('服务端初始值')

    await 名称输入框.fill('校验中的旧值')
    let 提交按钮 = page.getByRole('button', { name: '验证并提交' })
    let 提交操作 = 提交按钮.click()
    await expect(page.locator('lsby-form-input-default').first()).toHaveAttribute('aria-busy', 'true')
    await 名称输入框.fill('')
    await 提交操作
    await expect(page.getByRole('alert').filter({ hasText: '普通文本演示为必填项' })).toBeVisible()
    await expect(提交按钮).toBeEnabled()
    await expect(page.getByRole('dialog', { name: '表单提交数据' })).toHaveCount(0)

    // 2. 依次填入各项控件数据
    await 演示_说明_右下角(page, '依次录入普通文本、数字、下拉选择、单选、复选、多选下拉与开关等控件')
    await 演示_输入(名称输入框, '示例资料')
    await 演示_输入(page.getByRole('spinbutton', { name: '数字输入演示' }), '3')
    await 演示_选择(page.getByRole('combobox', { name: '下拉选择演示' }), 'business')
    await 演示_勾选(page.getByRole('radio', { name: '紧凑' }))
    await 演示_勾选(page.getByRole('checkbox', { name: '复选框演示' }))
    await 演示_勾选(page.getByRole('checkbox', { name: '表格' }))

    await 表单.evaluate((元素): void => {
      元素.addEventListener('变化', (事件): void => {
        if (事件.target === 元素) 元素.setAttribute('data-observed-change', 'true')
      })
    })
    let 多选下拉 = page.getByRole('combobox', { name: '多选下拉演示' })
    let 多选下拉组件 = page.locator('lsby-form-multi-select')
    await 演示_点击(多选下拉)
    await 演示_点击(page.getByText('前端', { exact: true }))
    await expect(多选下拉).toContainText('已选 1 项')

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Space')
    await expect(page.getByRole('option', { name: '后端', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(多选下拉).toContainText('已选 2 项')

    await 多选下拉组件.evaluate((元素): void => {
      if ('刷新列表' in 元素 === false || typeof 元素.刷新列表 !== 'function')
        throw new Error('多选下拉未提供刷新列表方法')
      元素.刷新列表([{ 文字: '后端', value: 'backend' }])
    })
    await expect(多选下拉).toContainText('已选 1 项')
    await expect(表单).toHaveAttribute('data-observed-change', 'true')
    await 多选下拉组件.evaluate((元素): void => {
      if ('刷新列表' in 元素 === false || typeof 元素.刷新列表 !== 'function')
        throw new Error('多选下拉未提供刷新列表方法')
      元素.刷新列表([
        { 文字: '前端', value: 'frontend' },
        { 文字: '后端', value: 'backend' },
        { 文字: '测试', value: 'testing' },
      ])
    })
    await 演示_点击(page.getByText('前端', { exact: true }))
    await expect(多选下拉).toContainText('已选 2 项')
    await page.mouse.click(1, 1)
    await expect(多选下拉).toHaveAttribute('aria-expanded', 'false')
    let 打开浮层列表 = await page
      .locator(':popover-open')
      .evaluateAll((元素列表) =>
        元素列表.map((元素) => ({ 标签: 元素.tagName, 角色: 元素.getAttribute('role'), 文本: 元素.textContent })),
      )
    expect(打开浮层列表).toEqual([])

    await 演示_勾选(page.getByRole('switch', { name: '布尔开关演示' }))
    let 自动伸缩文本框 = page.getByRole('textbox', { name: '自动伸缩文本框演示' })
    await 演示_输入(自动伸缩文本框, '多行文本示例')
    await 自动伸缩文本框.blur()
    await expect(表单).toHaveAttribute('data-observed-change', 'true')

    // 3. 提交并展示数据模态框
    await 演示_说明_右下角(page, '表单填写完毕，点击“验证并提交”查看解析后的强类型结构化数据')
    await 演示_点击(提交按钮)

    let 数据模态框 = page.getByRole('dialog', { name: '表单提交数据' })
    await expect(数据模态框).toBeVisible()
    await expect(数据模态框).toContainText('"name": "示例资料"')
    await expect(数据模态框).toContainText('"quantity": 3')
    await expect(数据模态框).toContainText('"category": "business"')
    await expect(数据模态框).toContainText('"mode": "紧凑"')
    await expect(数据模态框).toContainText('"confirmed": true')
    await expect(数据模态框).toContainText('"frontend"')
    await expect(数据模态框).toContainText('"backend"')
    await expect(数据模态框).toContainText('"description": "多行文本示例"')
    await expect(数据模态框).toContainText('"switchDemo": true')

    await 演示_说明_右下角(page, '数据验证正确，点击关闭数据弹窗')
    await 演示_点击(page.getByRole('button', { name: '关闭' }))
    await expect(数据模态框).toBeHidden()

    await 演示_完成(
      page,
      '表单校验与数据提交演示完成！\n已成功验证表单控件数据收集、强类型 Zod 模式校验与前端弹窗数据回显。',
    )
  })

  // 浮层模态框响应式布局与业务表格多维排序
  test('浮层模态框响应式布局与业务表格多维排序', async ({ page }): Promise<void> => {
    await page.goto('/demo/login.html')

    // 1. 核心原则：开场在测试第一秒立刻居中出现
    await 演示_开场(
      page,
      '【测试用例】浮层模态框响应式布局与业务表格多维排序\n展示模态框的全屏最大化、还原与自适应尺寸，以及高交互业务表格的表头多列多重排序（方向与优先级）能力。',
    )

    // 2. 前置准备：仅显示一次进入说明，随后快速就绪现场
    await 演示_作用域(
      {
        page,
        粒度: '浮层现场准备',
        进入说明: '前置准备：自动登录演示系统并切换至浮层反馈现场',
        跳过步骤说明: true,
        跳过操作动画: true,
      },
      async () => {
        await 登录演示页(page)
        await 切换演示标签(page, '浮层反馈')
      },
    )

    // 3. 核心业务演示：到达现场后，恢复细致步骤引导
    // 1. 浮层反馈：模态框最大化与还原
    await 演示_说明_右下角(page, '点击“打开模态框”，验证模态框弹出与堆叠')
    await 演示_点击(page.getByRole('button', { name: '打开模态框' }))
    let 模态框 = page.getByRole('dialog').filter({ hasText: '模态框支持堆叠' })
    await expect(模态框).toBeVisible()

    let 原边界 = await 模态框.boundingBox()
    await 演示_说明_右下角(page, '点击“最大化”按钮，使模态框铺满当前浏览器视口')
    await 演示_点击(page.getByRole('button', { name: '最大化' }))
    await expect(page.getByRole('button', { name: '还原' })).toBeVisible()
    let 最大化边界 = await 模态框.boundingBox()
    let 视口 = page.viewportSize()
    expect(原边界).not.toBeNull()
    expect(最大化边界).not.toBeNull()
    expect(视口).not.toBeNull()
    if (原边界 === null || 最大化边界 === null || 视口 === null) return
    expect(最大化边界.width).toBeCloseTo(视口.width, 0)
    expect(最大化边界.height).toBeCloseTo(视口.height, 0)

    await 演示_说明_右下角(page, '点击“还原”按钮，恢复模态框原本的尺寸')
    await 演示_点击(page.getByRole('button', { name: '还原' }))
    await expect(page.getByRole('button', { name: '最大化' })).toBeVisible()
    let 还原边界 = await 模态框.boundingBox()
    expect(还原边界).not.toBeNull()
    if (还原边界 === null) return
    expect(还原边界.width).toBeCloseTo(原边界.width, 0)
    expect(还原边界.height).toBeCloseTo(原边界.height, 0)

    await 演示_说明_右下角(page, '点击“关闭”按钮关闭模态框')
    await 演示_点击(page.getByRole('button', { name: '关闭' }))
    await expect(模态框).toBeHidden()

    // 2. 业务示例：自适应模态框
    await 切换演示标签(page, '业务示例')
    await 演示_说明_右下角(page, '点击“添加数据”打开未指定尺寸的自适应模态框')
    await 演示_点击(page.getByRole('button', { name: '添加数据' }))
    let 自适应模态框 = page.getByRole('dialog', { name: '添加用户' })
    await expect(自适应模态框).toBeVisible()
    let 边界 = await 自适应模态框.boundingBox()
    expect(边界).not.toBeNull()
    if (边界 === null) return
    expect(边界.width).toBeLessThanOrEqual(642)
    expect(边界.height).toBeLessThan(视口.height * 0.7)

    await 演示_说明_右下角(page, '自适应尺寸校验通过，点击“关闭”按钮')
    await 演示_点击(page.getByRole('button', { name: '关闭' }))
    await expect(自适应模态框).toBeHidden()

    // 3. 业务示例：先创建足够的数据，再验证表格的实际排序结果与多列优先级
    await 演示_说明_右下角(page, '依次创建三个名称顺序被打乱的用户，为排序验证准备可观察的数据')
    await 添加演示用户(page, 'sort-user-c')
    await 添加演示用户(page, 'sort-user-a')
    await 添加演示用户(page, 'sort-user-b')
    await expect(
      page.getByRole('row').filter({ has: page.getByRole('button', { name: '编辑', exact: true }) }),
    ).toHaveCount(4)

    let 用户表格 = page.locator('lsby-table')
    await 用户表格.evaluate((元素): void => {
      元素.addEventListener('操作点击', (事件): void => {
        if (事件.target === 元素 && 事件 instanceof CustomEvent) {
          let 详情: unknown = 事件.detail
          if (typeof 详情 === 'object' && 详情 !== null && '操作名' in 详情 && 详情.操作名 === '编辑') {
            元素.setAttribute('data-observed-operation', '编辑')
          }
        }
      })
    })
    await 演示_点击(page.getByRole('button', { name: '编辑', exact: true }).first())
    await expect(用户表格).toHaveAttribute('data-observed-operation', '编辑')
    await 演示_点击(page.getByRole('button', { name: '取消', exact: true }))

    await 演示_说明_右下角(page, '点击“名称”表头列，验证用户数据确实按名称升序重新排列')
    await 演示_点击(page.getByRole('button', { name: '名称', exact: true }))
    await expect(page.getByRole('button', { name: '名称 ▲1', exact: true })).toBeVisible()
    let 名称升序行 = await 读取用户表格行(page)
    expect(名称升序行.map((行) => 行.名称)).toEqual(['admin', 'sort-user-a', 'sort-user-b', 'sort-user-c'])

    await 演示_说明_右下角(page, '点击“ID”表头列，添加 ID 二级排序并保持名称为首要排序条件')
    await 演示_点击(page.getByRole('button', { name: 'ID', exact: true }))
    await expect(page.getByRole('button', { name: '名称 ▲1', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ID ▲2', exact: true })).toBeVisible()
    expect((await 读取用户表格行(page)).map((行) => 行.名称)).toEqual(名称升序行.map((行) => 行.名称))

    await 演示_说明_右下角(page, '再次点击“名称 ▲1”，验证首要排序切换为名称降序')
    await 演示_点击(page.getByRole('button', { name: '名称 ▲1', exact: true }))
    await expect(page.getByRole('button', { name: '名称 ▼1', exact: true })).toBeVisible()
    expect((await 读取用户表格行(page)).map((行) => 行.名称)).toEqual([
      'sort-user-c',
      'sort-user-b',
      'sort-user-a',
      'admin',
    ])

    await 演示_说明_右下角(page, '第三次点击名称表头移除该排序，使 ID 成为首要升序条件')
    await 演示_点击(page.getByRole('button', { name: '名称 ▼1', exact: true }))
    await expect(page.getByRole('button', { name: 'ID ▲1', exact: true })).toBeVisible()
    let ID升序行 = await 读取用户表格行(page)
    expect(ID升序行.map((行) => 行.id)).toEqual([...ID升序行.map((行) => 行.id)].sort(比较文本))

    await 演示_说明_右下角(page, '再次点击“ID ▲1”，验证数据行按 ID 降序重新排列')
    await 演示_点击(page.getByRole('button', { name: 'ID ▲1', exact: true }))
    await expect(page.getByRole('button', { name: 'ID ▼1', exact: true })).toBeVisible()
    let ID降序行 = await 读取用户表格行(page)
    expect(ID降序行.map((行) => 行.id)).toEqual([...ID降序行.map((行) => 行.id)].sort(比较文本).reverse())

    await 演示_说明_右下角(page, '切换排序后进行 Shift 范围选择，验证锚点跟随稳定行键而不是旧行号')
    await 演示_点击(page.getByRole('button', { name: 'ID ▼1', exact: true }))
    await 演示_点击(page.getByRole('button', { name: '名称', exact: true }))
    let 用户B行 = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'sort-user-b', exact: true }) })
    await 用户B行.click()
    await 演示_点击(page.getByRole('button', { name: '名称 ▲1', exact: true }))
    let 管理员行 = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'admin', exact: true }) })
    await 管理员行.click({ modifiers: ['Shift'] })
    await expect(page.locator('lsby-table tbody tr[aria-selected="true"]')).toHaveCount(3)
    let 选中数量 = await 用户表格.evaluate((元素): number => {
      if ('获得选中行键' in 元素 === false || typeof 元素.获得选中行键 !== 'function')
        throw new Error('表格未提供获得选中行键方法')
      let 行键列表: unknown = 元素.获得选中行键()
      if (Array.isArray(行键列表) === false) throw new Error('表格选中行键返回值无效')
      return 行键列表.length
    })
    expect(选中数量).toBe(3)

    // 4. 定格在当前最终排好序的业务表格界面上，展示最终成果
    await 演示_完成(
      page,
      '浮层与业务表格演示完成！\n已成功验证浮层最大化/自适应缩放机制，以及表格多重排序（多方向与多优先级协同更新）。当前页面为多重排序生效后的最终展示。',
    )
  })

  test('任务管理组件重新连接时保持标签唯一', async ({ page }): Promise<void> => {
    await page.goto('/demo/login.html')
    await 登录演示页(page)
    await page.goto('/admin-job.html')

    let 任务管理组件 = page.locator('lsby-admin-job')
    await expect(page.getByRole('tab', { name: '即时任务', exact: true })).toHaveCount(1)
    await expect(page.getByRole('tab', { name: '定时任务', exact: true })).toHaveCount(1)

    let 滚动容器 = page.locator('lsby-scroll-container').first()
    let 刷新后滚动条状态 = await 滚动容器.evaluate(async (元素) => {
      if ('刷新' in 元素 === false || typeof 元素.刷新 !== 'function') throw new Error('滚动容器缺少刷新方法')
      await 元素.刷新()
      let 影子根 = 元素.shadowRoot
      if (影子根 === null) throw new Error('滚动容器缺少 Shadow DOM')
      let 基础样式数量 = [...影子根.children].filter(
        (子元素): boolean => 子元素 instanceof HTMLStyleElement && 子元素.dataset['componentBaseStyle'] === 'true',
      ).length
      let 滚动区域 = [...影子根.children].find(
        (子元素): 子元素 is HTMLDivElement =>
          子元素 instanceof HTMLDivElement && 子元素.classList.contains('scroll-container'),
      )
      if (滚动区域 === undefined) throw new Error('滚动容器缺少内部滚动区域')
      return { 基础样式数量, 滚动条宽度: getComputedStyle(滚动区域, '::-webkit-scrollbar').width }
    })
    expect(刷新后滚动条状态).toEqual({ 基础样式数量: 1, 滚动条宽度: '6px' })

    await 任务管理组件.evaluate(async (元素): Promise<void> => {
      let 父元素 = 元素.parentElement
      if (父元素 === null) throw new Error('任务管理组件缺少父元素')
      元素.remove()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      父元素.append(元素)
    })

    await expect(page.getByRole('tab', { name: '即时任务', exact: true })).toHaveCount(1)
    await expect(page.getByRole('tab', { name: '定时任务', exact: true })).toHaveCount(1)
  })
})
