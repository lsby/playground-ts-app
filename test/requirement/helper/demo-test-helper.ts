import type { Locator } from '@playwright/test'

import { cleanDB } from '../../../scripts/db/clean-db'
import { 全局资源 } from '../../../src/global/global'
import { init } from '../../../src/init/init'
import { 浏览器测试引擎 } from '../../../src/model/browser-test'
import type { 提交步骤附件, 需求测试会话, 需求测试运行参数 } from '../../../src/model/test-requirement'

export type 演示需求系统上下文 = { 引擎: 浏览器测试引擎; 新用户名后缀: string }

export async function 准备演示需求上下文(参数: 需求测试运行参数): Promise<需求测试会话<演示需求系统上下文>> {
  await cleanDB(全局资源.获得数据库().获得句柄())
  await init()
  let { 引擎, 收集附件, 关闭 } = await 浏览器测试引擎.打开会话({
    服务地址: 参数.服务地址,
    初始地址: '/demo/login.html',
    附件目录: 参数.附件目录,
  })
  return { 上下文: { 引擎, 新用户名后缀: `${String(Date.now())}-${String(参数.流程序号)}` }, 收集附件, 关闭 }
}

export async function 记录浏览器画面(
  引擎: 浏览器测试引擎,
  提交附件: 提交步骤附件,
  说明: string,
  标注?: Locator,
): Promise<void> {
  提交附件([
    { 类型: '文本', 内容: 说明 },
    { 类型: '图片', 内容类型: 'image/png', 内容: (await 引擎.截图(标注)).toString('base64') },
  ])
}

export async function 登录演示页(
  引擎: 浏览器测试引擎,
  用户名: string,
  密码: string,
  提交附件: 提交步骤附件,
): Promise<void> {
  await 引擎.导航('/demo/login.html')
  await 引擎.输入(引擎.按角色('textbox', { name: '用户名' }), 用户名)
  await 引擎.输入(引擎.按角色('textbox', { name: '密码' }), 密码)
  let 登录按钮 = 引擎.按角色('button', { name: '登录演示系统' })
  await 记录浏览器画面(引擎, 提交附件, `已填写账号 ${用户名} 和密码，点击「登录演示系统」。`, 登录按钮)
  await 引擎.点击(登录按钮)
  await 引擎.等待地址('**/demo/index.html')
}

export async function 打开用户管理页(引擎: 浏览器测试引擎, 提交附件: 提交步骤附件): Promise<void> {
  let 标签 = 引擎.按角色('tab', { name: '业务示例', exact: true })
  await 记录浏览器画面(引擎, 提交附件, '点击「业务示例」标签，打开用户管理页。', 标签)
  await 引擎.点击(标签)
  await 等待元素可见(引擎.按角色('button', { name: '添加数据' }))
}

export async function 等待元素可见(元素: Locator): Promise<void> {
  await 元素.waitFor({ state: 'visible' })
}

export async function 等待元素隐藏(元素: Locator): Promise<void> {
  await 元素.waitFor({ state: 'hidden' })
}
