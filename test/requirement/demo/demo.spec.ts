import { test } from '@playwright/test'

import { 选择结果 } from '../../../src/model/requirement-test'
import { 演示_说明 } from '../../e2e/tools/demo-mode'
import { 演示业务需求模型, 演示需求依赖, 管理员新增用户流程 } from './demo-model'

演示业务需求模型.检查()

test.describe('演示用户管理业务需求', (): void => {
  test(管理员新增用户流程.名称, async ({ page }, testInfo): Promise<void> => {
    let 执行器 = 演示业务需求模型.创建执行器({
      系统上下文: { page, 新用户名: `需求用户-${testInfo.retry}` },
      已满足依赖们: [演示需求依赖.浏览器],
      选择结果: new 选择结果([]),
      执行命名步骤: async (名称, 执行) => {
        await 演示_说明(page, 名称)
        return await test.step(名称, 执行)
      },
    })
    let 报告 = await 执行器.执行(管理员新增用户流程)
    await testInfo.attach('requirement-evidence.json', {
      body: JSON.stringify(报告, undefined, 2),
      contentType: 'application/json',
    })
  })
})
