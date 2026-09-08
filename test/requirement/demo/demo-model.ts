import { expect, type Page } from '@playwright/test'

import { 流程, 测试模型, 状态, 行为, 观察, 需求, 验收点, type 流程上下文 } from '../../../src/model/requirement-test'

export enum 演示需求依赖 {
  浏览器 = '浏览器',
}

export type 演示需求系统上下文 = { page: Page; 新用户名: string }
type 演示需求流程上下文 = 流程上下文<演示需求系统上下文, 演示需求依赖>

let 管理员可进入演示业务页 = new 验收点<演示需求依赖>({
  描述: '管理员可进入演示业务页',
  验收手段: '自动',
  依赖方案们: [[演示需求依赖.浏览器]],
})
let 管理员可提交新用户资料 = new 验收点<演示需求依赖>({
  描述: '管理员可提交新用户资料',
  验收手段: '自动',
  依赖方案们: [[演示需求依赖.浏览器]],
})
let 新用户出现在业务列表 = new 验收点<演示需求依赖>({
  描述: '新用户出现在业务列表',
  验收手段: '自动',
  依赖方案们: [[演示需求依赖.浏览器]],
})

export let 管理员维护用户需求 = new 需求({
  名称: '管理员维护用户',
  描述: '管理员登录演示系统后，可以新增用户并在列表中确认结果。',
  验收点们: [管理员可进入演示业务页, 管理员可提交新用户资料, 新用户出现在业务列表],
})

let 初始状态 = 状态.初始<演示需求流程上下文>({
  名称: '演示数据库已初始化',
  准备: async (): Promise<void> => {
    let [{ cleanDB }, { kysely管理器 }, { init }] = await Promise.all([
      import('../../../scripts/db/clean-db'),
      import('../../../src/global/global'),
      import('../../../src/init/init'),
    ])
    await cleanDB(kysely管理器.获得句柄())
    await init()
  },
})

export let 管理员新增用户流程 = new 流程<演示需求流程上下文, 演示需求依赖>({
  名称: '管理员新增一个用户',
  给定状态: 初始状态,
  步骤们: [
    new 行为('管理员从独立演示登录页登录', async ({ 系统 }): Promise<void> => {
      await 系统.page.goto('/demo/login.html')
      await 系统.page.getByRole('textbox', { name: '用户名' }).fill('admin')
      await 系统.page.getByRole('textbox', { name: '密码' }).fill('123456')
      await 系统.page.getByRole('button', { name: '登录演示系统' }).click()
      await 系统.page.waitForURL('**/demo/index.html')
    }),
    new 观察('观察业务目录可用', async ({ 系统 }) => {
      await expect(系统.page.getByRole('heading', { name: '可运行的组件示例' })).toBeVisible()
      return { 通过: true, 证据们: [{ 手段: '页面', 描述: '登录后业务目录可见', 内容: 系统.page.url() }] }
    }),
    new 行为('管理员填写并提交新用户', async ({ 系统 }): Promise<void> => {
      await 系统.page.getByRole('button', { name: '业务示例', exact: true }).click()
      await 系统.page.getByRole('button', { name: '添加数据' }).click()
      await 系统.page.getByRole('textbox', { name: '用户名' }).fill(系统.新用户名)
      await 系统.page.getByRole('textbox', { name: '密码' }).fill('pass-123456')
      await 系统.page.getByRole('button', { name: '确认', exact: true }).click()
    }),
    new 观察('观察列表显示新增用户', async ({ 系统 }) => {
      await expect(系统.page.getByRole('cell', { name: 系统.新用户名 })).toBeVisible()
      return { 通过: true, 证据们: [{ 手段: '页面', 描述: '新增用户出现在业务列表', 内容: 系统.新用户名 }] }
    }),
  ],
  覆盖验收点们: [管理员可进入演示业务页, 管理员可提交新用户资料, 新用户出现在业务列表],
})

export let 演示业务需求模型 = new 测试模型({
  元数据: {
    初始状态,
    依赖条件们: Object.values(演示需求依赖),
    选择们: [],
    选择约束们: [],
    证据策略: { 允许手段们: ['页面'] },
  },
  需求们: [管理员维护用户需求],
  流程们: [管理员新增用户流程],
})
