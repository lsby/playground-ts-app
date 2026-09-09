import { expect, type Page } from '@playwright/test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  流程,
  测试模型,
  状态,
  行为,
  观察,
  选择,
  选择约束,
  需求,
  验收点,
  type 流程上下文,
} from '../../../src/model/requirement'
import { 演示_点击, 演示_输入 } from '../../e2e/tools/demo-mode'

export enum 演示需求依赖 {
  浏览器 = '浏览器',
}

export type 演示需求系统上下文 = { page: Page; 新用户名后缀: string }
type 演示需求流程上下文 = 流程上下文<演示需求系统上下文, 演示需求依赖>

// ==================== 1. 业务静态选择与约束 ====================

export let 账号类型选择 = new 选择({
  名称: '账号类型',
  说明: '指定新增用户的身份类型，将决定用户名生成规则及安全策略。',
  选项们: [
    { 值: '普通用户', 标签: '普通用户', 说明: '具备基本业务权限的常规用户。' },
    { 值: '审计用户', 标签: '审计用户', 说明: '具备系统审计和只读查看权限的高权限账号。' },
  ] as const,
})

export let 密码安全级别选择 = new 选择({
  名称: '密码安全级别',
  说明: '设置用户的初始密码强度，高安全账户必须搭配强密码。',
  选项们: [
    { 值: 'standard', 标签: '标准密码', 说明: '普通强度密码 pass-123456。' },
    { 值: 'strong', 标签: '高强密码', 说明: '高强度复杂密码 Pass#2026_Secure。' },
  ] as const,
})

export let 审计用户密码约束 = new 选择约束({
  描述: '审计用户必须使用高强密码',
  涉及选择们: [账号类型选择, 密码安全级别选择],
  检查: (选择读取器): boolean => {
    let 账号类型 = 选择读取器.读取(账号类型选择)
    let 密码级别 = 选择读取器.读取(密码安全级别选择)
    if (账号类型 === '审计用户') {
      return 密码级别 === 'strong'
    }
    return true
  },
})

// ==================== 2. 需求与验收点 ====================

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
let 管理员人工核验用户管理入口完备 = new 验收点<演示需求依赖>({
  描述: '管理员人工核验用户管理入口完备',
  验收手段: '人工',
  依赖方案们: [[演示需求依赖.浏览器]],
})

export let 管理员维护用户需求 = new 需求({
  名称: '管理员维护用户',
  描述: '管理员登录演示系统后，可以新增用户并在列表中确认结果。',
  验收点们: [管理员可进入演示业务页, 管理员可提交新用户资料, 新用户出现在业务列表, 管理员人工核验用户管理入口完备],
})

// ==================== 3. 状态链与行为复用 ====================

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

export let 管理员登录行为 = new 行为<演示需求流程上下文>(
  '管理员从独立演示登录页登录',
  async ({ 系统 }): Promise<void> => {
    await 系统.page.goto('/demo/login.html')
    await 演示_输入(系统.page.getByRole('textbox', { name: '用户名' }), 'admin')
    await 演示_输入(系统.page.getByRole('textbox', { name: '密码' }), '123456')
    await 演示_点击(系统.page.getByRole('button', { name: '登录演示系统' }))
    await 系统.page.waitForURL('**/demo/index.html')
  },
)

// 使用“状态.施加”派生新状态，展现行为组合与状态结合律
export let 管理员已登录状态 = 初始状态.施加('管理员已登录并进入演示主页', 管理员登录行为)

// ==================== 4. 业务流程定义 ====================

export let 管理员访问演示业务主页流程 = new 流程<演示需求流程上下文, 演示需求依赖>({
  名称: '管理员访问演示业务主页',
  给定状态: 初始状态,
  步骤们: [
    管理员登录行为,
    new 观察('观察业务目录可用', async ({ 系统 }) => {
      await expect(系统.page.getByRole('heading', { name: '可运行的组件示例' })).toBeVisible()
      return { 通过: true, 证据们: [{ 手段: '页面', 描述: '登录后业务目录可见', 内容: 系统.page.url() }] }
    }),
  ],
  覆盖验收点们: [管理员可进入演示业务页],
})

export let 管理员新增用户流程 = new 流程<演示需求流程上下文, 演示需求依赖>({
  名称: '管理员新增一个用户',
  给定状态: 管理员已登录状态,
  步骤们: [
    new 行为('管理员填写并提交新用户', async ({ 系统, 选择, 快照 }): Promise<void> => {
      let 账号类型 = 选择.读取(账号类型选择)
      let 密码级别 = 选择.读取(密码安全级别选择)
      let 实际用户名 = `${账号类型}-${系统.新用户名后缀}`
      let 实际密码 = 密码级别 === 'strong' ? 'Pass#2026_Secure' : 'pass-123456'

      await 演示_点击(系统.page.getByRole('button', { name: '业务示例', exact: true }))
      await 演示_点击(系统.page.getByRole('button', { name: '添加数据' }))

      // 在稳定检查点请求保存快照
      快照.保存('打开新增用户弹窗完成')

      await 演示_输入(系统.page.getByRole('textbox', { name: '用户名' }), 实际用户名)
      await 演示_输入(系统.page.getByRole('textbox', { name: '密码' }), 实际密码)
      await 演示_点击(系统.page.getByRole('button', { name: '确认', exact: true }))
    }),
    new 观察('观察列表显示新增用户', async ({ 系统, 选择 }) => {
      let 账号类型 = 选择.读取(账号类型选择)
      let 实际用户名 = `${账号类型}-${系统.新用户名后缀}`
      await expect(系统.page.getByRole('cell', { name: 实际用户名 })).toBeVisible()
      return { 通过: true, 证据们: [{ 手段: '页面', 描述: '新增用户出现在业务列表', 内容: 实际用户名 }] }
    }),
  ],
  覆盖验收点们: [管理员可提交新用户资料, 新用户出现在业务列表],
})

export let 管理员人工核验用户管理界面流程 = new 流程<演示需求流程上下文, 演示需求依赖>({
  名称: '管理员人工核验用户管理界面',
  给定状态: 管理员已登录状态,
  步骤们: [
    new 行为('管理员进入用户管理业务页', async ({ 系统 }): Promise<void> => {
      await 演示_点击(系统.page.getByRole('button', { name: '业务示例', exact: true }))
      await expect(系统.page.getByRole('button', { name: '添加数据' })).toBeVisible()
    }),
    new 观察('人工核对用户管理操作入口与布局', async ({ 系统 }) => {
      let 添加数据按钮 = await 系统.page.getByRole('button', { name: '添加数据' }).isVisible()
      let 编辑按钮 = await 系统.page.getByRole('button', { name: '编辑' }).first().isVisible()
      let 删除按钮 = await 系统.page.getByRole('button', { name: '删除' }).first().isVisible()
      let 修改密码按钮 = await 系统.page.getByRole('button', { name: '修改密码' }).first().isVisible()
      let 通过 = 添加数据按钮 && 编辑按钮 && 删除按钮 && 修改密码按钮
      if (通过 === false) {
        return {
          通过: false,
          原因: '用户列表操作列入口不齐备',
          证据们: [
            {
              手段: '人工检查',
              描述: '核对用户列表操作列入口存在缺失',
              内容: { 添加数据按钮, 编辑按钮, 删除按钮, 修改密码按钮 },
            },
          ],
        }
      }
      return {
        通过: true,
        证据们: [
          {
            手段: '人工检查',
            描述: '人工核对用户列表操作列入口完备（添加数据、编辑、删除、修改密码均可见）',
            内容: { 添加数据按钮, 编辑按钮, 删除按钮, 修改密码按钮 },
          },
        ],
      }
    }),
  ],
  覆盖验收点们: [管理员人工核验用户管理入口完备],
})

// ==================== 5. 测试模型与元数据 ====================

let __dirname = path.dirname(fileURLToPath(import.meta.url))
let 快照根目录 = path.resolve(__dirname, '../../../test-outputs/requirement-snapshots')

export let 演示业务需求模型 = new 测试模型({
  元数据: {
    初始状态,
    依赖条件们: Object.values(演示需求依赖),
    选择们: [账号类型选择, 密码安全级别选择],
    选择约束们: [审计用户密码约束],
    证据策略: { 允许手段们: ['页面', '人工检查'] },
    快照: {
      根目录: 快照根目录,
      创建: async ({ 快照目录, 清单 }): Promise<void> => {
        await fs.writeFile(
          path.join(快照目录, 'checkpoint-data.json'),
          JSON.stringify({ 清单, 记录时间: new Date().toISOString() }, undefined, 2),
          'utf8',
        )
      },
      恢复: async (): Promise<void> => {
        // 演示恢复逻辑
      },
    },
  },
  需求们: [管理员维护用户需求],
  流程们: [管理员访问演示业务主页流程, 管理员新增用户流程, 管理员人工核验用户管理界面流程],
})
