import { 组件基类, 要求组件构造参数 } from '../../base/base'
import { 创建元素 } from '../../global/tools/create-element'
import { 卡片组件 } from '../general/base/card'
import { 演示加法组件 } from './add-demo'
import { 演示capacitor组件 } from './capacitor-demo'
import { 演示electron组件 } from './electron-demo'
import { 演示文件上传组件 } from './file-upload/index'
import { 演示接口类型组件 } from './get-interface-type-demo'
import { 演示吐司消息组件 } from './toast-demo'
import { 演示todo组件 } from './todo-list-demo'
import { 演示ws组件 } from './ws-demo'

type 发出事件类型 = {}
type 监听事件类型 = {}
type 演示能力分组 = '数据与通信' | '浮层反馈' | '业务扩展' | '跨端能力'
type 演示能力配置 = { 分组: 演示能力分组 }

export class 演示能力组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-capability-demo', this)
  }

  private 配置: 演示能力配置

  public constructor(配置: 演示能力配置) {
    super()
    this.配置 = 要求组件构造参数(配置, '演示能力组件')
  }

  protected override 当加载时(): void {
    let 内容 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--间距-6)' } })
    switch (this.配置.分组) {
      case '数据与通信':
        内容.append(
          this.创建网格([
            new 卡片组件({
              标题: '接口调用：加法',
              描述: '验证类型化输入与 API 请求。',
              内容: new 演示加法组件({ a: '1', b: '2' }),
            }),
            new 卡片组件({
              标题: '本地状态：待办',
              描述: '验证组件内部状态、列表刷新与元素引用。',
              内容: new 演示todo组件(),
            }),
            new 卡片组件({
              标题: 'WebSocket 双向消息',
              描述: '验证连接建立、服务端推送与前端发送。',
              内容: new 演示ws组件(),
            }),
          ]),
          new 卡片组件({
            标题: '接口类型导出',
            描述: '展示生成的系统接口类型如何通过接口获取。',
            内容: new 演示接口类型组件(),
          }),
        )
        break
      case '浮层反馈':
        内容.append(
          new 卡片组件({
            标题: 'Toast 完整演示',
            描述: '展示成功、错误、警告、信息、长文本和连续消息。',
            内容: new 演示吐司消息组件(),
          }),
        )
        break
      case '业务扩展':
        内容.append(
          new 卡片组件({
            标题: '多文件上传',
            描述: '展示文件选择、拖拽、列表管理和 FormData 上传。',
            内容: new 演示文件上传组件(),
          }),
        )
        break
      case '跨端能力':
        内容.append(
          this.创建网格([
            new 卡片组件({
              标题: 'Electron 能力',
              描述: '展示桌面端对话框与窗口焦点控制。',
              内容: new 演示electron组件(),
            }),
            new 卡片组件({ 标题: 'Capacitor 能力', 描述: '展示移动端原生对话框调用。', 内容: new 演示capacitor组件() }),
          ]),
        )
        break
    }
    this.shadow.append(内容)
  }

  private 创建网格(卡片列表: 卡片组件[]): HTMLDivElement {
    let 网格 = 创建元素('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
        alignItems: 'flex-start',
        gap: 'var(--间距-4)',
      },
    })
    网格.append(...卡片列表)
    return 网格
  }
}
