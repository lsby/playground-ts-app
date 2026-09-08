import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 主要按钮 } from '../general/base/base-button'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 演示ws组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-ws-demo', this)
  }

  private 发送消息函数: ((data: { message: string }) => void) | null = null

  private 按钮 = new 主要按钮({
    文本: '开始测试',
    自动加载: false,
    点击处理函数: (): void => {
      this.安全执行(async (): Promise<void> => await this.开始测试())
    },
  })

  private 发送按钮 = new 主要按钮({
    文本: '发送消息',
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

  private async 开始测试(): Promise<void> {
    await API管理器.请求postJson并处理错误(
      '/api/demo/ws/ws-test',
      {},
      async (data) => {
        this.结果.textContent = data.data
      },
      async (发送消息, _ws) => {
        this.发送消息函数 = 发送消息
      },
    )
  }
}
