import { expect, test, type Page, type TestInfo } from '@playwright/test'

import { 演示_作用域, 演示_完成, 演示_开场, 演示_说明_右下角 } from '../../../src/model/test-interactive'
import { 选择值, 选择结果, type 流程, type 流程执行报告 } from '../../../src/model/test-requirement'
import {
  密码安全级别选择,
  演示业务需求模型,
  演示需求依赖,
  管理员交互式人工核验用户管理界面流程,
  管理员全流程维护用户资料与安全凭据流程,
  管理员访问并自动核验用户管理模块流程,
  账号类型选择,
  type 演示需求流程上下文,
} from './demo-model'

演示业务需求模型.检查()

async function 运行需求演示流程(参数: {
  page: Page
  流程: 流程<演示需求流程上下文, 演示需求依赖>
  新用户名后缀: string
  演示说明: string
  演示粒度?: string
  选择结果?: 选择结果
  从快照恢复?: string
  证据附件后缀?: string
  testInfo: TestInfo
}): Promise<流程执行报告<演示需求依赖>> {
  let 选择 =
    参数.选择结果 ??
    参数.流程.选择结果 ??
    new 选择结果([选择值(账号类型选择, '普通用户'), 选择值(密码安全级别选择, 'standard')])

  // 1. 核心原则：开场在用例启动时立即居中出现
  if (参数.page.url() === 'about:blank') {
    await 参数.page.goto('/demo/login.html')
  }
  await 演示_开场(
    参数.page,
    `【业务流程】${参数.流程.名称}\n\n【演示目标】${参数.演示说明}\n\n【覆盖验收点】\n${参数.流程.覆盖验收点们.map((点, 索引) => `${索引 + 1}. ${点.描述}`).join('\n')}`,
    '🎯 业务需求演示目标',
  )

  let 执行器 = 演示业务需求模型.创建执行器({
    系统上下文: { page: 参数.page, 新用户名后缀: 参数.新用户名后缀 },
    已满足依赖们: [演示需求依赖.浏览器],
    选择结果: 选择,
    执行命名步骤: async (名称, 执行, 元信息) => {
      let 是前置准备 = 元信息?.阶段 === '准备初始状态' || 元信息?.阶段 === '准备给定状态' || 元信息?.阶段 === '恢复快照'
      if (是前置准备) {
        // 前置准备步骤：不逐个展示说明和操作动画
        return await 演示_作用域(
          { 粒度: 元信息?.演示粒度 ?? '前置准备', 跳过步骤说明: true, 跳过操作动画: true },
          async () => {
            return await test.step(名称, 执行)
          },
        )
      }
      // 核心业务步骤：右下角细致指引
      await 演示_说明_右下角(参数.page, 名称)
      return await test.step(名称, 执行)
    },
  })

  let 报告 = await 执行器.执行(参数.流程, {
    ...(参数.演示粒度 === undefined ? {} : { 演示粒度: 参数.演示粒度 }),
    ...(参数.从快照恢复 === undefined ? {} : { 从快照恢复: 参数.从快照恢复 }),
  })
  expect(报告.观察记录们.length).toBeGreaterThan(0)
  for (let 记录 of 报告.观察记录们) {
    expect(记录.结果.通过).toBe(true)
  }

  let 附件后缀 = 参数.证据附件后缀 === undefined ? '' : `-${参数.证据附件后缀}`
  await 参数.testInfo.attach(`requirement-evidence${附件后缀}.json`, {
    body: JSON.stringify(报告, undefined, 2),
    contentType: 'application/json',
  })

  await 演示_完成(
    参数.page,
    `流程【${参数.流程.名称}】验证通过！\n覆盖验收点：${参数.流程.覆盖验收点们.map((点) => 点.描述).join('、')}\n观察证据数：${报告.观察记录们.length}`,
  )
  return 报告
}

test.describe('演示用户管理业务需求', (): void => {
  test(管理员访问并自动核验用户管理模块流程.名称, async ({ page }, testInfo): Promise<void> => {
    await 运行需求演示流程({
      page,
      流程: 管理员访问并自动核验用户管理模块流程,
      新用户名后缀: '0',
      演示说明: '演示管理员从系统门户登录，访问用户管理模块，并自动核验主界面及添加、编辑、删除、修改密码入口。',
      testInfo,
    })
  })

  test(管理员全流程维护用户资料与安全凭据流程.名称, async ({ page }, testInfo: TestInfo): Promise<void> => {
    let 首次报告 = await 运行需求演示流程({
      page,
      流程: 管理员全流程维护用户资料与安全凭据流程,
      新用户名后缀: `test-${String(testInfo.retry)}`,
      演示说明:
        '演示管理员在用户管理模块中完整的新增用户、表单输入与安全校验、资料持久化以及后续为该用户修改安全凭据（重置密码）的核心业务闭环。',
      证据附件后缀: 'initial',
      testInfo,
    })
    let 快照 = 首次报告.创建快照们[0]
    expect(快照).toBeDefined()
    if (快照 === undefined) throw new Error('首次流程没有创建可恢复的快照')

    let 恢复报告 = await 运行需求演示流程({
      page,
      流程: 管理员全流程维护用户资料与安全凭据流程,
      新用户名后缀: `test-${String(testInfo.retry)}`,
      演示说明: '从新增用户已持久化的检查点恢复，跳过前置创建步骤并继续完成密码维护与重新登录验证。',
      从快照恢复: 快照.uuid,
      证据附件后缀: 'restored',
      testInfo,
    })
    expect(恢复报告.从快照恢复?.uuid).toBe(快照.uuid)
    expect(恢复报告.跳过步骤数量).toBeGreaterThan(0)
  })

  test(管理员交互式人工核验用户管理界面流程.名称, async ({ page }, testInfo): Promise<void> => {
    test.skip(process.env['DEMO_MODE'] !== 'true', '人工核验流程需要在 --demo 模式下由审核员确认')
    await 运行需求演示流程({
      page,
      流程: 管理员交互式人工核验用户管理界面流程,
      新用户名后缀: 'manual-check',
      演示说明:
        '演示需要人工介入的验收环节：在用户管理界面排版渲染就绪后，由人工审核员通过交互式确认框在线核验排版与功能可用性。',
      演示粒度: '用户管理人工核验',
      testInfo,
    })
  })
})
