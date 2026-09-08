import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 演示登录检查组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-demo-auth-check', this)
  }

  protected override async 当加载时(): Promise<void> {
    let 结果 = await API管理器.请求postJson并处理错误('/api/demo/auth/is-login', {})
    if (结果.isLogin === false) window.location.assign('/demo/login.html')
  }
}
