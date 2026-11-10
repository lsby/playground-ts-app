import { deepStrictEqual } from 'node:assert/strict'
import { z } from 'zod'

import { 流程, 行为, 观察, 需求测试, 验收点, type 需求测试上下文 } from '../../../src/model/test-requirement'
import { 读取操作结果字段 } from '../../../src/test-tools/operation-assertion'
import type { JSON对象 } from '../../../src/test-tools/operation-record'
import { 整理数据库查询结果 } from '../../../src/test-tools/operation-values'
import { 业务需求, 验收点们 } from './index.requirement'

type 测试数据 = { 结果们: Map<number, JSON对象> }
type 测试上下文 = 需求测试上下文<测试数据>
let 待注册用户名 = 'blocked-e2e'

let 业务流程 = new 流程<测试上下文>({
  名称: '关闭注册时拦截访客',
  测试思路: '注册关闭时，从登录页和注册直达地址检查入口，再直接提交注册请求并查库。',
  步骤们: [
    new 行为<测试上下文>('打开登录页', async (当前状态): Promise<测试上下文> => {
      let 引擎 = await 当前状态.工具.浏览器.打开('关闭注册的访客')
      await 引擎.导航('/login.html', { timeout: 20000, waitUntil: 'domcontentloaded' })
      return 当前状态
    }),
    new 观察<测试上下文>('确认登录页没有注册入口', async (当前状态): Promise<void> => {
      {
        let 引擎 = 当前状态.工具.浏览器.获得('关闭注册的访客')
        await 引擎.验证可见(引擎.按角色('heading', { name: '登录', exact: true }), { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('关闭注册的访客')
        await 引擎.验证隐藏(引擎.按文本('还没有账号？立即注册', { exact: true }), { timeout: 5000 })
      }
    }),
    new 行为<测试上下文>('尝试打开注册直达地址', async (当前状态): Promise<测试上下文> => {
      let 引擎 = 当前状态.工具.浏览器.获得('关闭注册的访客')
      await 引擎.导航('/login.html?register=true', { timeout: 5000, waitUntil: 'domcontentloaded' })
      return 当前状态
    }),
    new 观察<测试上下文>('确认只显示登录表单', async (当前状态): Promise<void> => {
      {
        let 引擎 = 当前状态.工具.浏览器.获得('关闭注册的访客')
        await 引擎.验证可见(引擎.按角色('heading', { name: '登录', exact: true }), { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('关闭注册的访客')
        await 引擎.验证隐藏(引擎.按角色('heading', { name: '注册', exact: true }), { timeout: 5000 })
      }
      {
        let 引擎 = 当前状态.工具.浏览器.获得('关闭注册的访客')
        await 引擎.验证隐藏(引擎.按文本('还没有账号？立即注册', { exact: true }), { timeout: 5000 })
      }
    }),
    new 观察<测试上下文>('确认注册接口拒绝请求且没有创建账号', async (当前状态, 提交附件): Promise<void> => {
      let { 工具 } = 当前状态
      let 响应 = await fetch(new URL('/api/project/register', 工具.服务地址()), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userName: 待注册用户名, userPassword: 'TestPass26!' }),
        signal: 工具.取消信号,
      })
      if (响应.ok === false) throw new Error(`注册请求失败，HTTP ${String(响应.status)}`)
      let 结果 = z.object({ status: z.literal('fail'), data: z.literal('注册未启用') }).parse(await 响应.json())
      提交附件([{ 类型: '文本', 内容: `注册接口返回「${结果.data}」。` }])
      当前状态.结果们.set(
        11,
        整理数据库查询结果(工具.数据库.查询('SELECT name FROM user WHERE name = ?', [待注册用户名], ['name'])),
      )
      {
        let 实际 = 读取操作结果字段(当前状态.结果们, 11, ['rowCount'])
        let 预期 = 0
        deepStrictEqual(实际, 预期)
        提交附件([{ 类型: '文本', 内容: `预期 ${JSON.stringify(预期)}\n实际 ${JSON.stringify(实际)}` }], {
          并入上一组: true,
        })
      }
    }),
  ],
  覆盖验收点们: [验收点们['注册关闭']].map((点: 验收点 | undefined): 验收点 => {
    if (点 instanceof 验收点 === false || 业务需求.包含(点) === false)
      throw new Error('流程“关闭注册时拦截访客”引用了无效的验收点')
    return 点
  }),
})

export default class 导出的需求测试 extends 需求测试<测试数据> {
  public constructor() {
    super([业务需求], [业务流程], { 使用测试服务: true })
  }

  protected override 准备数据(): 测试数据 {
    return { 结果们: new Map<number, JSON对象>() }
  }
}
