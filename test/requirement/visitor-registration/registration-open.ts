import { deepStrictEqual } from 'node:assert/strict'
import { z } from 'zod'

import { 获得环境变量 } from '../../../src/global/env'
import {
  流程,
  行为,
  观察,
  需求测试,
  验收点,
  type 需求测试上下文,
  type 需求测试工具,
} from '../../../src/model/test-requirement'
import { 读取操作结果字段 } from '../../../src/test-tools/operation-assertion'
import type { JSON对象 } from '../../../src/test-tools/operation-record'
import { 整理数据库查询结果 } from '../../../src/test-tools/operation-values'
import { 业务需求, 验收点们 } from './index.requirement'

type 测试数据 = { 结果们: Map<number, JSON对象> }
type 测试上下文 = 需求测试上下文<测试数据>

let 业务流程 = new 流程<测试上下文>({
  名称: '开放注册时创建并使用访客账号',
  标签们: ['开放注册', '浏览器'],
  测试思路: '访客提交两次不同的密码并查库，改正后完成注册。再由独立访客尝试重名注册，核对原账号并验证它仍能登录。',
  步骤们: [
    new 行为<测试上下文>('提交两次不同的密码', async (当前状态): Promise<测试上下文> => {
      {
        let 引擎 = await 当前状态.工具.浏览器.打开('开放注册的访客')
        await 引擎.导航('/login.html', { timeout: 5000, waitUntil: 'domcontentloaded' })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.点击(引擎.按文本('还没有账号？立即注册', { exact: true }), { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.输入(引擎.按角色('textbox', { name: '用户名', exact: true }), 'visitor-e2e', { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.输入(引擎.按角色('textbox', { name: '密码', exact: true }), 'TestPass26!', { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.输入(引擎.按角色('textbox', { name: '确认密码', exact: true }), 'OtherPass26!', { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.点击(引擎.按角色('button', { name: '注册', exact: true }), { timeout: 5000 })
      }
      return 当前状态
    }),
    new 观察<测试上下文>('确认密码不一致且没有创建账号', async (当前状态, 提交附件): Promise<void> => {
      {
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.验证可见(引擎.定位('[role="alert"]:text-is("两次输入的密码不一致")'), { timeout: 5000 })
      }
      当前状态.结果们.set(
        23,
        整理数据库查询结果(
          当前状态.工具.数据库.查询('SELECT name FROM user WHERE name = ?', ['visitor-e2e'], ['name']),
        ),
      )
      {
        let 实际 = 读取操作结果字段(当前状态.结果们, 23, ['rowCount'])
        let 预期 = 0
        deepStrictEqual(实际, 预期)
        提交附件([{ 类型: '文本', 内容: `预期 ${JSON.stringify(预期)}\n实际 ${JSON.stringify(实际)}` }], {
          并入上一组: true,
        })
      }
    }),
    new 行为<测试上下文>('改正确认密码并注册', async (当前状态): Promise<测试上下文> => {
      {
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.输入(引擎.按角色('textbox', { name: '确认密码', exact: true }), 'TestPass26!', { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.点击(引擎.按角色('button', { name: '注册', exact: true }), { timeout: 5000 })
      }
      return 当前状态
    }),
    new 观察<测试上下文>('确认注册成功并创建普通账号', async (当前状态, 提交附件): Promise<void> => {
      {
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.验证可见(引擎.按文本('注册成功，请登录', { exact: true }), { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.验证可见(引擎.按角色('heading', { name: '登录', exact: true }), { timeout: 5000 })
      }
      当前状态.结果们.set(
        28,
        整理数据库查询结果(
          当前状态.工具.数据库.查询(
            'SELECT id, name, is_admin FROM user WHERE name = ?',
            ['visitor-e2e'],
            ['name', 'is_admin'],
          ),
        ),
      )
      {
        let 实际 = {
          账号数: 读取操作结果字段(当前状态.结果们, 28, ['rowCount']),
          用户名: 读取操作结果字段(当前状态.结果们, 28, ['rows', 0, 'name']),
          管理员标记: 读取操作结果字段(当前状态.结果们, 28, ['rows', 0, 'is_admin']),
        }
        let 预期 = { 账号数: 1, 用户名: 'visitor-e2e', 管理员标记: 0 }
        deepStrictEqual(实际, 预期)
        提交附件([{ 类型: '文本', 内容: `预期 ${JSON.stringify(预期)}\n实际 ${JSON.stringify(实际)}` }], {
          并入上一组: true,
        })
      }
    }),
    new 行为<测试上下文>('使用同名账号再次注册', async (当前状态): Promise<测试上下文> => {
      {
        let 引擎 = await 当前状态.工具.浏览器.打开('重名注册的访客')
        await 引擎.导航('/login.html', { timeout: 5000, waitUntil: 'domcontentloaded' })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('重名注册的访客')
        await 引擎.点击(引擎.按文本('还没有账号？立即注册', { exact: true }), { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('重名注册的访客')
        await 引擎.输入(引擎.按角色('textbox', { name: '用户名', exact: true }), 'visitor-e2e', { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('重名注册的访客')
        await 引擎.输入(引擎.按角色('textbox', { name: '密码', exact: true }), 'OtherPass26!', { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('重名注册的访客')
        await 引擎.输入(引擎.按角色('textbox', { name: '确认密码', exact: true }), 'OtherPass26!', { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('重名注册的访客')
        await 引擎.点击(引擎.按角色('button', { name: '注册', exact: true }), { timeout: 5000 })
      }
      return 当前状态
    }),
    new 观察<测试上下文>('确认重名被拒且原账号仍存在', async (当前状态, 提交附件): Promise<void> => {
      {
        let 引擎 = 当前状态.工具.浏览器.获得('重名注册的访客')
        await 引擎.验证可见(引擎.定位('lsby-login [role="alert"]:has-text("用户名已存在")'), { timeout: 5000 })
      }
      当前状态.结果们.set(
        40,
        整理数据库查询结果(
          当前状态.工具.数据库.查询(
            'SELECT id, name, is_admin FROM user WHERE name = ?',
            ['visitor-e2e'],
            ['name', 'is_admin'],
          ),
        ),
      )
      {
        let 实际 = 读取操作结果字段(当前状态.结果们, 40, ['rowCount'])
        let 预期 = 1
        deepStrictEqual(实际, 预期)
        let 原账号ID = 读取操作结果字段(当前状态.结果们, 28, ['rows', 0, 'id'])
        let 重名提交后的账号ID = 读取操作结果字段(当前状态.结果们, 40, ['rows', 0, 'id'])
        deepStrictEqual(重名提交后的账号ID, 原账号ID, '重名注册前后应保留同一个账号')
        提交附件([{ 类型: '文本', 内容: '数据库仍只有一条同名账号记录，且账号 ID 未变。' }], { 并入上一组: true })
      }
    }),
    new 行为<测试上下文>('用自动带入的用户名登录', async (当前状态, 提交附件): Promise<测试上下文> => {
      {
        提交附件([{ 类型: '文本', 内容: '决策说明\n只填写密码，使用注册成功后自动带入的用户名登录。' }])
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.输入(引擎.按角色('textbox', { name: '密码', exact: true }), 'TestPass26!', { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.点击(引擎.按角色('button', { name: '登录', exact: true }), { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
        await 引擎.等待地址('**/index.html', { timeout: 5000, waitUntil: 'domcontentloaded' })
      }
      return 当前状态
    }),
    new 观察<测试上下文>('确认进入项目首页', async (当前状态): Promise<void> => {
      let 引擎 = 当前状态.工具.浏览器.获得('开放注册的访客')
      await 引擎.验证可见(引擎.按角色('heading', { name: '项目首页', exact: true }), { timeout: 5000 })
    }),
  ],
  覆盖验收点们: [验收点们['注册成功'], 验收点们['重名被拒绝'], 验收点们['密码不一致']].map(
    (点: 验收点 | undefined): 验收点 => {
      if (点 instanceof 验收点 === false || 业务需求.包含(点) === false)
        throw new Error('流程“开放注册时创建并使用访客账号”引用了无效的验收点')
      return 点
    },
  ),
})

export default class 导出的需求测试 extends 需求测试<测试数据> {
  public constructor() {
    super([业务需求], [业务流程], { 使用测试服务: true })
  }

  protected override async 准备数据(工具: 需求测试工具): Promise<测试数据> {
    let { DEFAULT_SYSTEM_USER, DEFAULT_SYSTEM_PWD } = 获得环境变量()
    let 登录响应 = await fetch(new URL('/api/project/login', 工具.服务地址()), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userName: DEFAULT_SYSTEM_USER, userPassword: DEFAULT_SYSTEM_PWD }),
      signal: 工具.取消信号,
    })
    if (登录响应.ok === false) throw new Error(`测试管理员登录请求失败，HTTP ${String(登录响应.status)}`)
    let { data } = z
      .object({ status: z.literal('success'), data: z.object({ token: z.string().min(1) }) })
      .parse(await 登录响应.json())
    let 配置响应 = await fetch(new URL('/api/system/update-system-config', 工具.服务地址()), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${data.token}` },
      body: JSON.stringify({ enable_register: true }),
      signal: 工具.取消信号,
    })
    if (配置响应.ok === false) throw new Error(`开启测试环境注册请求失败，HTTP ${String(配置响应.status)}`)
    z.object({ status: z.literal('success') }).parse(await 配置响应.json())
    return { 结果们: new Map<number, JSON对象>() }
  }
}
