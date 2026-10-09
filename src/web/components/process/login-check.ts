import { 本地数据库Schema指纹 } from '../../../types/local-first-database-meta'
import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 本地优先远程不可用错误, 本地优先远程同步错误 } from '../../global/manager/local-first-error'
import { 读取本地优先状态 } from '../../global/manager/local-first-state'
import { 创建本地优先恢复入口 } from '../general/local-first-recovery'
import { 同步项目本地优先数据 } from '../project/local-first-sync'

type 发出事件类型 = { 检测到未登录: null }
type 监听事件类型 = {}

export class 检查登录组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-login-check', this)
  }

  protected override async 当加载时(): Promise<void> {
    if (API管理器.已设置token() === true) {
      try {
        await 同步项目本地优先数据()
        return
      } catch (错误) {
        if (错误 instanceof 本地优先远程同步错误 && 错误.code === 'NOT_LOGGED_IN') {
          await API管理器.清除token()
          this.跳转登录页()
          return
        }
        if (this.允许离线登录(错误) === false) {
          this.显示本地优先恢复入口(错误)
          return
        }
      }
    }
    let 结果 = await API管理器.请求postJson并处理错误('/api/project/is-login', {}, { 信号: this.渲染信号 })
    if (结果.isLogin === true) return

    // 尝试本地免密码登录
    let 本地登录结果 = await API管理器.请求postJson('/api/project/local-login', {}, { 信号: this.渲染信号 })
    if (本地登录结果.status === 'success') {
      await API管理器.设置token(本地登录结果.data.token)
      try {
        await 同步项目本地优先数据()
      } catch (错误) {
        if (this.允许离线登录(错误) === false) this.显示本地优先恢复入口(错误)
      }
      return
    }

    // 将当前页面路径作为 URL 参数传递给登录页
    this.跳转登录页()
  }

  private 跳转登录页(): void {
    let 当前路径 = encodeURIComponent(window.location.pathname + window.location.search)
    window.location.assign(`/login.html?redirect=${当前路径}`)
  }

  private 显示本地优先恢复入口(错误: unknown): void {
    this.shadow.append(
      创建本地优先恢复入口({
        错误,
        重试: async (): Promise<void> => await 同步项目本地优先数据(),
        恢复成功: (): void => window.location.reload(),
      }),
    )
  }

  private 本地数据可用(): boolean {
    try {
      return 读取本地优先状态()?.schemaFingerprint === 本地数据库Schema指纹
    } catch {
      return false
    }
  }

  private 允许离线登录(错误: unknown): boolean {
    return 错误 instanceof 本地优先远程不可用错误 && this.本地数据可用() === true
  }
}
