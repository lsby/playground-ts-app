import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 日志组件 } from '../general/log/log'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 系统日志页面组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-admin-log', this)
  }

  private 日志组件 = new 日志组件()

  protected override async 当加载时(): Promise<void> {
    this.获得宿主样式().width = '100%'
    this.获得宿主样式().height = '100%'
    this.获得宿主样式().display = 'flex'
    this.获得宿主样式().flexDirection = 'column'

    // 设置日志组件样式
    this.日志组件.style.height = '100%'
    this.日志组件.style.width = '100%'

    this.shadow.appendChild(this.日志组件)

    // 初始加载日志
    await this.加载日志(this.渲染信号)
  }

  private async 加载日志(信号: AbortSignal): Promise<void> {
    try {
      // 设置加载状态
      this.日志组件.设置加载状态(true)

      let 响应 = await API管理器.请求postJson并处理错误(
        '/api/admin-log/get-logs',
        {},
        async (ws数据: { 新日志: { 时间: string; 消息: string } }) => {
          this.添加新日志(ws数据.新日志)
        },
        undefined,
        undefined,
        undefined,
        { 信号 },
      )

      // 显示历史日志
      响应.日志列表.forEach((日志) => {
        this.添加新日志(日志)
      })

      // 隐藏加载状态
      this.日志组件.设置加载状态(false)
    } catch (错误) {
      if (信号.aborted === true) throw 错误
      console.error('加载日志失败:', 错误)
      this.日志组件.设置加载状态(false)
      this.日志组件.添加日志('加载日志失败')
    }
  }

  private 添加新日志(日志: { 时间: string; 消息: string }): void {
    let 日志消息 = `[${new Date(日志.时间).toLocaleString()}] ${日志.消息}`
    this.日志组件.添加日志(日志消息)
  }
}
