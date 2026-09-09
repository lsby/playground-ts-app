import { expect, test } from '@playwright/test'

import { 选择值, 选择结果 } from '../../../src/model/requirement'
import { 演示_说明 } from '../../e2e/tools/demo-mode'
import {
  密码安全级别选择,
  演示业务需求模型,
  演示需求依赖,
  管理员人工核验用户管理界面流程,
  管理员新增用户流程,
  管理员访问演示业务主页流程,
  账号类型选择,
} from './demo-model'

演示业务需求模型.检查()

test.describe('演示用户管理业务需求', (): void => {
  test(管理员访问演示业务主页流程.名称, async ({ page }): Promise<void> => {
    let 执行器 = 演示业务需求模型.创建执行器({
      系统上下文: { page, 新用户名后缀: '0' },
      已满足依赖们: [演示需求依赖.浏览器],
      选择结果: new 选择结果([选择值(账号类型选择, '普通用户'), 选择值(密码安全级别选择, 'standard')]),
      执行命名步骤: async (名称, 执行) => {
        await 演示_说明(page, 名称)
        return await test.step(名称, 执行)
      },
    })
    let 报告 = await 执行器.执行(管理员访问演示业务主页流程)
    expect(报告.观察记录们.length).toBeGreaterThan(0)
  })

  test(管理员新增用户流程.名称, async ({ page }, testInfo): Promise<void> => {
    let 执行器 = 演示业务需求模型.创建执行器({
      系统上下文: { page, 新用户名后缀: `test-${testInfo.retry}` },
      已满足依赖们: [演示需求依赖.浏览器],
      选择结果: new 选择结果([选择值(账号类型选择, '审计用户'), 选择值(密码安全级别选择, 'strong')]),
      执行命名步骤: async (名称, 执行) => {
        await 演示_说明(page, 名称)
        return await test.step(名称, 执行)
      },
    })
    let 报告 = await 执行器.执行(管理员新增用户流程)
    expect(报告.创建快照们.length).toBeGreaterThan(0)
    await testInfo.attach('requirement-evidence.json', {
      body: JSON.stringify(报告, undefined, 2),
      contentType: 'application/json',
    })
  })

  test(管理员人工核验用户管理界面流程.名称, async ({ page }): Promise<void> => {
    let 执行器 = 演示业务需求模型.创建执行器({
      系统上下文: { page, 新用户名后缀: 'manual' },
      已满足依赖们: [演示需求依赖.浏览器],
      选择结果: new 选择结果([选择值(账号类型选择, '普通用户'), 选择值(密码安全级别选择, 'standard')]),
      执行命名步骤: async (名称, 执行) => {
        await 演示_说明(page, 名称)
        return await test.step(名称, 执行)
      },
    })
    let 报告 = await 执行器.执行(管理员人工核验用户管理界面流程)
    expect(报告.观察记录们.length).toBeGreaterThan(0)
  })
})
