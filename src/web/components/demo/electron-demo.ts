import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 主要按钮 } from '../general/base/base-button'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 演示electron组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-electron-demo', this)
  }

  protected override async 当加载时(): Promise<void> {
    let 按钮组 = 创建元素('div', {
      style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--间距-2)' },
    })
    let 提示框测试 = new 主要按钮({
      文本: '提示框测试',
      点击处理函数: async (): Promise<void> => {
        await API管理器.请求postJson并处理错误('/api/demo/electron/dialog', {})
      },
    })
    let 允许焦点 = new 主要按钮({
      文本: '允许焦点',
      点击处理函数: async (): Promise<void> => {
        await API管理器.请求postJson并处理错误('/api/demo/electron/set-focus', { value: true })
      },
    })
    let 不允许焦点 = new 主要按钮({
      文本: '不允许焦点',
      点击处理函数: async (): Promise<void> => {
        await API管理器.请求postJson并处理错误('/api/demo/electron/set-focus', { value: false })
      },
    })
    按钮组.append(提示框测试, 允许焦点, 不允许焦点)
    this.shadow.append(按钮组)
  }
}
