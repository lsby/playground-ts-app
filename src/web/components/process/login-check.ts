import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 同步项目本地优先数据, 尝试同步项目本地优先数据 } from '../project/local-first-sync'

type 发出事件类型 = { 检测到未登录: null }
type 监听事件类型 = {}

export class 检查登录组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-login-check', this)
  }

  protected override async 当加载时(): Promise<void> {
    await 尝试同步项目本地优先数据('恢复登录')
    let 结果 = await API管理器.请求postJson并处理错误('/api/project/is-login', {}, { 信号: this.渲染信号 })
    if (结果.isLogin === true) return

    // 尝试本地免密码登录
    let 本地登录结果 = await API管理器.请求postJson('/api/project/local-login', {}, { 信号: this.渲染信号 })
    if (本地登录结果.status === 'success') {
      await API管理器.设置token(本地登录结果.data.token)
      await 同步项目本地优先数据()
      return
    }

    // 将当前页面路径作为 URL 参数传递给登录页
    let 当前路径 = encodeURIComponent(window.location.pathname + window.location.search)
    window.location.assign(`/login.html?redirect=${当前路径}`)
  }
}
