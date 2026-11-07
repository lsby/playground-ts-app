import type { 浏览器测试引擎 } from '../../src/model/browser-test'
import { 端到端测试 } from '../../src/model/test-e2e'
import { 准备演示数据, 切换演示标签, 登录演示页 } from './helper/demo-test-helper'

type 用户表格行 = { id: string; 名称: string }

function 比较文本(左值: string, 右值: string): number {
  if (左值 < 右值) return -1
  if (左值 > 右值) return 1
  return 0
}

/**
 * 验证浮层模态框的响应式布局与业务表格的多维排序。
 * 准备演示账号后操作模态框和用户数据，检查实际尺寸、排序与行选择。
 */
class 浮层模态框与业务表格测试 extends 端到端测试 {
  public override async 准备数据(): Promise<void> {
    await 准备演示数据()
  }

  public override async 主流程(引擎: 浏览器测试引擎): Promise<void> {
    await 引擎.导航('/demo/login.html')

    // 1. 核心原则：开场在测试第一秒立刻居中出现
    await 引擎.开场(
      '【测试用例】浮层模态框响应式布局与业务表格多维排序\n展示模态框的全屏最大化、还原与自适应尺寸，以及高交互业务表格的表头多列多重排序（方向与优先级）能力。',
    )

    // 2. 前置准备：仅显示一次进入说明，随后快速就绪现场
    await 引擎.作用域(
      {
        粒度: '浮层现场准备',
        进入说明: '前置准备：自动登录演示系统并切换至浮层反馈现场',
        跳过步骤说明: true,
        跳过操作动画: true,
      },
      async () => {
        await 登录演示页(引擎)
        await 切换演示标签(引擎, '浮层反馈')
      },
    )

    // 3. 核心业务演示：到达现场后，恢复细致步骤引导
    // 1. 浮层反馈：模态框最大化与还原
    let 打开模态框按钮 = 引擎.按角色('button', { name: '打开模态框' })
    await 引擎.说明('点击“打开模态框”，验证模态框弹出与堆叠', 打开模态框按钮)
    await 引擎.点击(打开模态框按钮)
    let 模态框 = 引擎.按角色('dialog').filter({ hasText: '模态框支持堆叠' })
    await 引擎.断言(模态框).toBeVisible()

    let 原边界 = await 模态框.boundingBox()
    let 最大化按钮 = 模态框.getByRole('button', { name: '最大化' })
    let 还原按钮 = 模态框.getByRole('button', { name: '还原' })
    await 引擎.说明('点击“最大化”按钮，使模态框铺满当前浏览器视口', 最大化按钮)
    await 引擎.点击(最大化按钮)
    await 引擎.断言(还原按钮).toBeVisible()
    let 最大化边界 = await 模态框.boundingBox()
    let 视口 = 引擎.视口大小()
    引擎.断言(原边界).not.toBeNull()
    引擎.断言(最大化边界).not.toBeNull()
    引擎.断言(视口).not.toBeNull()
    if (原边界 === null || 最大化边界 === null || 视口 === null) return
    引擎.断言(最大化边界.width).toBeCloseTo(视口.width, 0)
    引擎.断言(最大化边界.height).toBeCloseTo(视口.height, 0)

    await 引擎.说明('点击“还原”按钮，恢复模态框原本的尺寸', 还原按钮)
    await 引擎.点击(还原按钮)
    await 引擎.断言(最大化按钮).toBeVisible()
    let 还原边界 = await 模态框.boundingBox()
    引擎.断言(还原边界).not.toBeNull()
    if (还原边界 === null) return
    引擎.断言(还原边界.width).toBeCloseTo(原边界.width, 0)
    引擎.断言(还原边界.height).toBeCloseTo(原边界.height, 0)

    let 关闭模态框按钮 = 模态框.getByRole('button', { name: '关闭' })
    await 引擎.说明('点击“关闭”按钮关闭模态框', 关闭模态框按钮)
    await 引擎.点击(关闭模态框按钮)
    await 引擎.断言(模态框).toBeHidden()

    // 2. 业务示例：自适应模态框
    await 切换演示标签(引擎, '业务示例')
    let 添加数据按钮 = 引擎.按角色('button', { name: '添加数据' })
    await 引擎.说明('点击“添加数据”打开未指定尺寸的自适应模态框', 添加数据按钮)
    await 引擎.点击(添加数据按钮)
    let 自适应模态框 = 引擎.按角色('dialog', { name: '添加用户' })
    await 引擎.断言(自适应模态框).toBeVisible()
    let 边界 = await 自适应模态框.boundingBox()
    引擎.断言(边界).not.toBeNull()
    if (边界 === null) return
    引擎.断言(边界.width).toBeLessThanOrEqual(642)
    引擎.断言(边界.height).toBeLessThan(视口.height * 0.7)

    let 关闭添加数据按钮 = 自适应模态框.getByRole('button', { name: '关闭' })
    await 引擎.说明('自适应尺寸校验通过，点击“关闭”按钮', 关闭添加数据按钮)
    await 引擎.点击(关闭添加数据按钮)
    await 引擎.断言(自适应模态框).toBeHidden()

    // 3. 业务示例：先创建足够的数据，再验证表格的实际排序结果与多列优先级
    await 引擎.说明('依次创建三个名称顺序被打乱的用户，为排序验证准备可观察的数据', 添加数据按钮)
    await this.添加演示用户(引擎, 'sort-user-c')
    await this.添加演示用户(引擎, 'sort-user-a')
    await this.添加演示用户(引擎, 'sort-user-b')
    await 引擎
      .断言(引擎.按角色('row').filter({ has: 引擎.按角色('button', { name: '编辑', exact: true }) }))
      .toHaveCount(4)

    let 用户表格 = 引擎.定位('lsby-table')
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
    await 引擎.点击(引擎.按角色('button', { name: '编辑', exact: true }).first())
    await 引擎.断言(用户表格).toHaveAttribute('data-observed-operation', '编辑')
    await 引擎.点击(引擎.按角色('button', { name: '取消', exact: true }))

    let 名称表头 = 引擎.按角色('button', { name: '名称', exact: true })
    let 名称升序表头 = 引擎.按角色('button', { name: '名称 ▲1', exact: true })
    let 名称降序表头 = 引擎.按角色('button', { name: '名称 ▼1', exact: true })
    let ID表头 = 引擎.按角色('button', { name: 'ID', exact: true })
    let ID升序表头 = 引擎.按角色('button', { name: 'ID ▲1', exact: true })
    let ID降序表头 = 引擎.按角色('button', { name: 'ID ▼1', exact: true })
    await 引擎.说明('点击“名称”表头列，验证用户数据确实按名称升序重新排列', 名称表头)
    await 引擎.点击(名称表头)
    await 引擎.断言(名称升序表头).toBeVisible()
    let 名称升序行 = await this.读取用户表格行(引擎)
    引擎.断言(名称升序行.map((行) => 行.名称)).toEqual(['admin', 'sort-user-a', 'sort-user-b', 'sort-user-c'])

    await 引擎.说明('点击“ID”表头列，添加 ID 二级排序并保持名称为首要排序条件', ID表头)
    await 引擎.点击(ID表头)
    await 引擎.断言(名称升序表头).toBeVisible()
    await 引擎.断言(引擎.按角色('button', { name: 'ID ▲2', exact: true })).toBeVisible()
    引擎.断言((await this.读取用户表格行(引擎)).map((行) => 行.名称)).toEqual(名称升序行.map((行) => 行.名称))

    await 引擎.说明('再次点击“名称 ▲1”，验证首要排序切换为名称降序', 名称升序表头)
    await 引擎.点击(名称升序表头)
    await 引擎.断言(名称降序表头).toBeVisible()
    引擎.断言((await this.读取用户表格行(引擎)).map((行) => 行.名称)).toEqual([
      'sort-user-c',
      'sort-user-b',
      'sort-user-a',
      'admin',
    ])

    await 引擎.说明('第三次点击名称表头移除该排序，使 ID 成为首要升序条件', 名称降序表头)
    await 引擎.点击(名称降序表头)
    await 引擎.断言(ID升序表头).toBeVisible()
    let ID升序行 = await this.读取用户表格行(引擎)
    引擎.断言(ID升序行.map((行) => 行.id)).toEqual([...ID升序行.map((行) => 行.id)].sort(比较文本))

    await 引擎.说明('再次点击“ID ▲1”，验证数据行按 ID 降序重新排列', ID升序表头)
    await 引擎.点击(ID升序表头)
    await 引擎.断言(ID降序表头).toBeVisible()
    let ID降序行 = await this.读取用户表格行(引擎)
    引擎.断言(ID降序行.map((行) => 行.id)).toEqual([...ID降序行.map((行) => 行.id)].sort(比较文本).reverse())

    await 引擎.说明('切换排序后进行 Shift 范围选择，验证锚点跟随稳定行键而不是旧行号', ID降序表头)
    await 引擎.点击(ID降序表头)
    await 引擎.点击(名称表头)
    let 用户B行 = 引擎.按角色('row').filter({ has: 引擎.按角色('cell', { name: 'sort-user-b', exact: true }) })
    await 引擎.点击(用户B行)
    await 引擎.点击(名称升序表头)
    let 管理员行 = 引擎.按角色('row').filter({ has: 引擎.按角色('cell', { name: 'admin', exact: true }) })
    await 引擎.点击(管理员行, { modifiers: ['Shift'] })
    await 引擎.断言(引擎.定位('lsby-table tbody tr[aria-selected="true"]')).toHaveCount(3)
    let 选中数量 = await 用户表格.evaluate((元素): number => {
      if ('获得选中行键' in 元素 === false || typeof 元素.获得选中行键 !== 'function')
        throw new Error('表格未提供获得选中行键方法')
      let 行键列表: unknown = 元素.获得选中行键()
      if (Array.isArray(行键列表) === false) throw new Error('表格选中行键返回值无效')
      return 行键列表.length
    })
    引擎.断言(选中数量).toBe(3)

    // 4. 定格在当前最终排好序的业务表格界面上，展示最终成果
    await 引擎.完成(
      '浮层与业务表格演示完成！\n模态框可以最大化、还原和自适应。表格支持多列排序，重新排序后 Shift 范围选择仍能选中正确的三行。',
    )
  }

  private async 添加演示用户(引擎: 浏览器测试引擎, 用户名: string): Promise<void> {
    await 引擎.点击(引擎.按角色('button', { name: '添加数据' }))
    await 引擎.输入(引擎.按角色('textbox', { name: '用户名' }), 用户名)
    await 引擎.输入(引擎.按角色('textbox', { name: '密码' }), 'sort-password')
    await 引擎.点击(引擎.按角色('button', { name: '确认', exact: true }))
    await 引擎.断言(引擎.按角色('cell', { name: 用户名, exact: true })).toBeVisible()
  }

  private async 读取用户表格行(引擎: 浏览器测试引擎): Promise<用户表格行[]> {
    await 引擎.断言(引擎.按角色('table')).toHaveAttribute('aria-busy', 'false')
    let 行列表 = 引擎.按角色('row').filter({ has: 引擎.按角色('button', { name: '编辑', exact: true }) })
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
}

export default 浮层模态框与业务表格测试
