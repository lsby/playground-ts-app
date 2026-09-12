import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 是中止错误 } from '../../global/tools/abort'
import { 创建元素 } from '../../global/tools/create-element'
import { 主要按钮 } from '../general/base/base-button'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 演示ws组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-ws-demo', this)
  }

  private 发送消息函数: ((data: { message: string }) => void) | null = null
  private 连接控制器: AbortController | null = null
  private 当前连接: WebSocket | null = null

  private 按钮 = new 主要按钮({
    文本: '开始测试',
    自动加载: false,
    点击处理函数: (): void => {
      this.安全执行(async (): Promise<void> => await this.开始测试())
    },
  })

  private 发送按钮 = new 主要按钮({
    文本: '发送消息',
    禁用: true,
    点击处理函数: async (): Promise<void> => {
      if (this.发送消息函数 !== null) {
        this.发送消息函数({ message: '来自前端的消息' })
      }
    },
  })

  private 结果 = 创建元素('p')

  protected override async 当加载时(): Promise<void> {
    let 按钮组 = 创建元素('div', {
      style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--间距-2)' },
    })
    按钮组.append(this.按钮, this.发送按钮)
    this.shadow.append(按钮组, this.结果)
  }

  protected override 当卸载时(): void {
    this.停止测试()
  }

  private async 开始测试(): Promise<void> {
    this.停止测试()
    let 连接控制器 = new AbortController()
    this.连接控制器 = 连接控制器
    try {
      await API管理器.请求postJson并处理错误(
        '/api/demo/ws/ws-test',
        {},
        async (data) => {
          if (连接控制器.signal.aborted === false) this.结果.textContent = data.data
        },
        async (发送消息, ws) => {
          if (连接控制器.signal.aborted === true) {
            ws.close()
            return
          }
          this.当前连接 = ws
          this.发送消息函数 = 发送消息
          this.发送按钮.设置禁用(false)
        },
        (): Promise<void> => {
          if (this.连接控制器 === 连接控制器) this.停止测试()
          return Promise.resolve()
        },
        undefined,
        { 信号: 连接控制器.signal },
      )
    } catch (错误) {
      if (是中止错误(错误, 连接控制器.signal) === false) throw 错误
    }
  }

  private 停止测试(): void {
    let 连接 = this.当前连接
    this.当前连接 = null
    this.发送消息函数 = null
    this.发送按钮.设置禁用(true)
    this.连接控制器?.abort()
    this.连接控制器 = null
    if (连接 !== null && 连接.readyState < WebSocket.CLOSING) 连接.close()
  }
}
