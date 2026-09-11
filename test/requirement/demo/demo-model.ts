import { expect, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { 演示_勾选, 演示_点击, 演示_确认, 演示_输入 } from '../../../src/model/test-interactive'
import {
  标签维度,
  流程,
  测试模型,
  状态,
  行为,
  观察,
  选择,
  选择值,
  选择约束,
  选择结果,
  通配选项,
  需求,
  验收点,
  type 流程上下文,
} from '../../../src/model/test-requirement'
import { 创建演示快照配置 } from './snapshot-fixture'

export enum 演示需求依赖 {
  浏览器 = '浏览器',
}

export type 演示需求系统上下文 = { page: Page; 新用户名后缀: string }
export type 演示需求流程上下文 = 流程上下文<演示需求系统上下文, 演示需求依赖>

// ==================== 0. 业务标签维度定义 ====================

export let 功能领域维度 = new 标签维度({
  名称: '功能领域',
  说明: '划分测试流程覆盖的业务功能范畴。',
  选项们: [
    通配选项('不限', '不限制功能范畴，展示所有功能领域的测试流程。'),
    { 值: '系统门户', 说明: '涉及系统主页导航、演示目录访问等全局公共门户能力。' },
    { 值: '用户管理', 说明: '涉及用户资料的新增、编辑、列表展示与权限维护等业务。' },
  ],
})

export let 场景类型维度 = new 标签维度({
  名称: '场景类型',
  说明: '按测试验证目标与执行深度划分的场景类别。',
  选项们: [
    通配选项('不限', '不限制场景类别，展示所有场景类型的测试流程。'),
    { 值: '冒烟验证', 说明: '轻量快速验证主路径畅通的基础链路用例。' },
    { 值: '核心业务', 说明: '包含完整交互、表单提交与状态持久化断言的端到端业务。' },
    { 值: '人工核验', 说明: '包含人工交互核对、操作入口与布局完备性确认的流程。' },
  ],
})

// ==================== 1. 业务静态选择与约束 ====================

export let 账号类型选择 = new 选择({
  名称: '账号类型',
  说明: '指定新增用户的身份类型，将决定用户名生成规则及安全策略。',
  选项们: [
    { 值: '普通用户', 标签: '普通用户', 说明: '具备基本业务权限的常规用户。' },
    { 值: '管理员用户', 标签: '管理员用户', 说明: '可访问用户管理与系统配置等管理员功能的高权限账号。' },
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

export let 管理员用户密码约束 = new 选择约束({
  描述: '管理员用户必须使用高强密码',
  涉及选择们: [账号类型选择, 密码安全级别选择],
  检查: (选择读取器): boolean => {
    let 账号类型 = 选择读取器.读取(账号类型选择)
    let 密码级别 = 选择读取器.读取(密码安全级别选择)
    if (账号类型 === '管理员用户') {
      return 密码级别 === 'strong'
    }
    return true
  },
})

// ==================== 2. 需求与验收点 ====================

export let 管理员可登录并访问用户管理模块 = new 验收点<演示需求依赖>({
  描述: '管理员可登录并访问用户管理模块',
  验收手段: '自动',
  依赖方案们: [[演示需求依赖.浏览器]],
})

export let 管理员可提交新用户资料 = new 验收点<演示需求依赖>({
  描述: '管理员可提交新用户资料',
  验收手段: '自动',
  依赖方案们: [[演示需求依赖.浏览器]],
})

export let 新用户按预期规则出现在用户列表 = new 验收点<演示需求依赖>({
  描述: '新用户按预期规则出现在用户列表',
  验收手段: '自动',
  依赖方案们: [[演示需求依赖.浏览器]],
})

export let 管理员可更新已有用户安全凭据 = new 验收点<演示需求依赖>({
  描述: '管理员可更新已有用户安全凭据',
  验收手段: '自动',
  依赖方案们: [[演示需求依赖.浏览器]],
})

export let 管理员可核验用户管理操作入口完备 = new 验收点<演示需求依赖>({
  描述: '管理员可核验用户管理操作入口完备',
  验收手段: '自动',
  依赖方案们: [[演示需求依赖.浏览器]],
})

export let 管理员交互式人工核验用户管理界面 = new 验收点<演示需求依赖>({
  描述: '管理员交互式人工核验用户管理界面',
  验收手段: '人工',
  依赖方案们: [[演示需求依赖.浏览器]],
})

export let 管理员维护用户需求 = new 需求({
  名称: '管理员维护用户',
  描述: '管理员登录演示系统后，可以访问用户管理模块、按策略新增用户、维护用户凭据并在界面中完成在线核验。',
  验收点们: [
    管理员可登录并访问用户管理模块,
    管理员可提交新用户资料,
    新用户按预期规则出现在用户列表,
    管理员可更新已有用户安全凭据,
    管理员可核验用户管理操作入口完备,
    管理员交互式人工核验用户管理界面,
  ],
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

export let 导航至用户管理页行为 = new 行为<演示需求流程上下文>(
  '管理员切换至用户管理业务示例',
  async ({ 系统 }): Promise<void> => {
    await 演示_点击(系统.page.getByRole('button', { name: '业务示例', exact: true }))
    await expect(系统.page.getByRole('button', { name: '添加数据' })).toBeVisible()
  },
)

// 使用“状态.施加”派生新状态，展现行为组合与状态结合律
export let 管理员已登录状态 = 初始状态.施加('管理员已登录并进入演示主页', 管理员登录行为)
export let 管理员已在用户管理页状态 = 管理员已登录状态.施加('管理员已在用户管理业务页', 导航至用户管理页行为)

// ==================== 4. 业务流程定义 ====================

export let 管理员访问并自动核验用户管理模块流程 = new 流程<演示需求流程上下文, 演示需求依赖>({
  名称: '管理员访问并自动核验用户管理模块',
  给定状态: 初始状态,
  步骤们: [
    管理员登录行为,
    导航至用户管理页行为,
    new 观察('自动核对用户管理主界面与操作入口', async ({ 系统 }) => {
      let 主界面 = await 系统.page.getByRole('heading', { name: '可运行的组件示例' }).isVisible()
      let 添加数据按钮 = await 系统.page.getByRole('button', { name: '添加数据' }).isVisible()
      let 编辑按钮 = await 系统.page.getByRole('button', { name: '编辑' }).first().isVisible()
      let 删除按钮 = await 系统.page.getByRole('button', { name: '删除' }).first().isVisible()
      let 修改密码按钮 = await 系统.page.getByRole('button', { name: '修改密码' }).first().isVisible()
      let 通过 = 主界面 && 添加数据按钮 && 编辑按钮 && 删除按钮 && 修改密码按钮
      let 内容 = { 主界面, 添加数据按钮, 编辑按钮, 删除按钮, 修改密码按钮 }
      if (通过 === false) {
        return {
          通过: false,
          原因: '用户管理主界面或操作入口不齐备',
          证据们: [{ 手段: '页面', 描述: '核对用户管理主界面与操作入口存在缺失', 内容 }],
        }
      }
      return {
        通过: true,
        证据们: [{ 手段: '页面', 描述: '登录后用户管理模块及添加、编辑、删除、修改密码入口均可用', 内容 }],
      }
    }),
  ],
  覆盖验收点们: [管理员可登录并访问用户管理模块, 管理员可核验用户管理操作入口完备],
  选择结果: new 选择结果([选择值(账号类型选择, '普通用户'), 选择值(密码安全级别选择, 'standard')]),
  标签字典: { 功能领域: '系统门户', 场景类型: '冒烟验证' },
})

export let 管理员全流程维护用户资料与安全凭据流程 = new 流程<演示需求流程上下文, 演示需求依赖>({
  名称: '管理员全流程维护用户资料与安全凭据',
  给定状态: 管理员已在用户管理页状态,
  步骤们: [
    new 行为('管理员打开新增用户表单', async ({ 系统 }): Promise<void> => {
      await 演示_点击(系统.page.getByRole('button', { name: '添加数据' }))
      await expect(系统.page.getByRole('dialog', { name: '添加用户' })).toBeVisible()
    }),
    new 行为('管理员填写并提交符合安全策略的用户资料', async ({ 系统, 选择 }): Promise<void> => {
      let 账号类型 = 选择.读取(账号类型选择)
      let 密码级别 = 选择.读取(密码安全级别选择)
      let 实际用户名 = `${账号类型}-${系统.新用户名后缀}`
      let 实际密码 = 密码级别 === 'strong' ? 'Pass#2026_Secure' : 'pass-123456'
      let 是管理员账号 = 账号类型 === '管理员用户'

      await 演示_输入(系统.page.getByRole('textbox', { name: '用户名' }), 实际用户名)
      await 演示_输入(系统.page.getByRole('textbox', { name: '密码' }), 实际密码)
      if (是管理员账号) await 演示_勾选(系统.page.getByRole('checkbox', { name: '账号权限' }))
      await 演示_点击(系统.page.getByRole('button', { name: '确认', exact: true }))
    }),
    new 观察('观察列表显示符合策略的新增用户', async ({ 系统, 选择, 快照 }) => {
      let 账号类型 = 选择.读取(账号类型选择)
      let 实际用户名 = `${账号类型}-${系统.新用户名后缀}`
      await expect(系统.page.getByRole('cell', { name: 实际用户名 })).toBeVisible()
      快照.保存('新增用户已持久化并显示在列表中')
      return {
        通过: true,
        证据们: [{ 手段: '页面', 描述: '新增管理员用户已成功持久化并展示在业务列表中', 内容: 实际用户名 }],
      }
    }),
    new 行为('管理员为新增用户修改安全凭据', async ({ 系统, 选择 }): Promise<void> => {
      let 账号类型 = 选择.读取(账号类型选择)
      let 实际用户名 = `${账号类型}-${系统.新用户名后缀}`
      let 用户行 = 系统.page.getByRole('row', { name: 实际用户名 })
      await 演示_点击(用户行.getByRole('button', { name: '修改密码' }))
      await expect(系统.page.getByRole('dialog', { name: '修改密码' })).toBeVisible()
      await 演示_输入(系统.page.getByRole('textbox', { name: '新密码' }), 'Pass#2026_NewSecret!')
      await 演示_点击(系统.page.getByRole('button', { name: '确认', exact: true }))
    }),
    new 观察('观察密码修改完成并恢复列表态', async ({ 系统 }) => {
      await expect(系统.page.getByRole('dialog', { name: '修改密码' })).not.toBeVisible()
      return {
        通过: true,
        证据们: [{ 手段: '页面', 描述: '用户新密码更新成功且修改密码对话框顺利关闭', 内容: '修改密码完成' }],
      }
    }),
    new 行为('新增用户使用更新后的密码重新登录', async ({ 系统, 选择 }): Promise<void> => {
      let 账号类型 = 选择.读取(账号类型选择)
      let 实际用户名 = `${账号类型}-${系统.新用户名后缀}`
      await 系统.page.goto('/demo/login.html')
      await 演示_输入(系统.page.getByRole('textbox', { name: '用户名' }), 实际用户名)
      await 演示_输入(系统.page.getByRole('textbox', { name: '密码' }), 'Pass#2026_NewSecret!')
      await 演示_点击(系统.page.getByRole('button', { name: '登录演示系统' }))
      await 系统.page.waitForURL('**/demo/index.html')
    }),
    new 观察('观察新增用户可使用新密码进入演示系统', async ({ 系统 }) => {
      await expect(系统.page.getByRole('heading', { name: '可运行的组件示例' })).toBeVisible()
      await 演示_点击(系统.page.getByRole('button', { name: '业务示例', exact: true }))
      await expect(系统.page.getByRole('button', { name: '添加数据' })).toBeVisible()
      await expect(系统.page.getByText('非管理员', { exact: false })).not.toBeVisible()
      return {
        通过: true,
        证据们: [{ 手段: '页面', 描述: '新增管理员使用更新后的密码登录并正常访问管理员功能', 内容: 系统.page.url() }],
      }
    }),
  ],
  覆盖验收点们: [管理员可提交新用户资料, 新用户按预期规则出现在用户列表, 管理员可更新已有用户安全凭据],
  选择结果: new 选择结果([选择值(账号类型选择, '管理员用户'), 选择值(密码安全级别选择, 'strong')]),
  标签字典: { 功能领域: '用户管理', 场景类型: '核心业务' },
})

export let 管理员交互式人工核验用户管理界面流程 = new 流程<演示需求流程上下文, 演示需求依赖>({
  名称: '管理员交互式人工核验用户管理界面',
  给定状态: 管理员已在用户管理页状态,
  步骤们: [
    new 观察('人工核对用户管理界面排版与功能可用性', async ({ 系统 }) => {
      let 审核通过 = await 演示_确认(
        系统.page,
        '【人工交互核验】请检查当前用户管理界面：\n1. 表格各列（ID、名称）数据对齐正常且无排版错位\n2. 顶部“添加数据”与行内“编辑/删除/修改密码”操作均清晰可见\n点击【是】确认验收通过，点击【否】判定验收未通过。',
      )
      if (审核通过 === false) {
        return {
          通过: false,
          原因: '人工交互核验未通过：审核员在确认框中选择了【否】',
          证据们: [{ 手段: '人工检查', 描述: '审核员拒绝了用户管理界面验收', 内容: '审核员在交互确认框中选择【否】' }],
        }
      }
      return {
        通过: true,
        证据们: [
          {
            手段: '人工检查',
            描述: '审核员在线通过了用户管理界面布局与交互核验',
            内容: '审核员在交互确认框中选择【是】',
          },
        ],
      }
    }),
  ],
  覆盖验收点们: [管理员交互式人工核验用户管理界面],
  选择结果: new 选择结果([选择值(账号类型选择, '普通用户'), 选择值(密码安全级别选择, 'standard')]),
  标签字典: { 功能领域: '用户管理', 场景类型: '人工核验' },
})

// ==================== 5. 测试模型与元数据 ====================

let __dirname = path.dirname(fileURLToPath(import.meta.url))
let 快照根目录 = path.resolve(__dirname, '../../../test-outputs/requirement-snapshots')

export let 演示业务需求模型 = new 测试模型({
  元数据: {
    初始状态,
    依赖条件们: Object.values(演示需求依赖),
    选择们: [账号类型选择, 密码安全级别选择],
    选择约束们: [管理员用户密码约束],
    标签维度们: [功能领域维度, 场景类型维度],
    证据策略: { 允许手段们: ['页面', '人工检查'] },
    快照: 创建演示快照配置(快照根目录),
  },
  需求们: [管理员维护用户需求],
  流程们: [
    管理员访问并自动核验用户管理模块流程,
    管理员全流程维护用户资料与安全凭据流程,
    管理员交互式人工核验用户管理界面流程,
  ],
})
