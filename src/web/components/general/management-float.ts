import { 组件基类 } from '../../base/base'
import { 主要按钮 } from './base/base-button'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 悬浮管理组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-management-float', this)
  }

  protected override async 当加载时(): Promise<void> {
    let 按钮 = new 主要按钮({
      文本: '管理',
      元素样式: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        backgroundColor: 'var(--主色调)',
        color: 'var(--主色调文字)',
        border: 'none',
        fontSize: '14px',
        fontWeight: 'bold',
        cursor: 'pointer',
        boxShadow: '0 4px 12px var(--深阴影颜色)',
        zIndex: '1000',
      },
      点击处理函数: async (): Promise<void> => {
        window.open('/admin.html', '_blank')
      },
    })

    this.shadow.append(按钮)
  }
}
