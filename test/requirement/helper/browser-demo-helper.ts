import type { 浏览器测试引擎 } from '../../../src/model/browser-test'

export async function 登录演示页(引擎: 浏览器测试引擎): Promise<void> {
  if (引擎.获得地址().includes('/demo/login.html') === false) {
    await 引擎.导航('/demo/login.html')
  }
  let 用户名输入框 = 引擎.按角色('textbox', { name: '用户名' })
  await 引擎.说明('正在进入演示系统登录页，准备执行自动登录', 用户名输入框)
  await 引擎.输入(用户名输入框, 'admin')
  await 引擎.输入(引擎.按角色('textbox', { name: '密码' }), '123456')
  await 引擎.点击(引擎.按角色('button', { name: '登录演示系统' }))
  await 引擎.等待地址('**/demo/index.html')
}

export async function 切换演示标签(引擎: 浏览器测试引擎, 标签: string): Promise<void> {
  let 目标标签 = 引擎.按角色('tab', { name: 标签, exact: true })
  await 引擎.说明(`切换演示标签页至：“${标签}”`, 目标标签)
  await 引擎.点击(目标标签)
}
