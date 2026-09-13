import { 环境变量 } from '../../../global/env'
import { 组件基类 } from '../../base/base'
import { 创建元素 } from '../../global/tools/create-element'

export class 样例模式标识组件 extends 组件基类<{}, {}> {
  static {
    this.注册组件('lsby-preview-indicator', this)
  }

  protected override 当加载时(): void {
    if (环境变量.PREVIEW_MODE === false) {
      this.hidden = true
      return
    }

    this.setAttribute('role', 'status')
    this.setAttribute('aria-label', '样例模式，部分业务数据为模拟')
    let 样式 = this.获得宿主样式()
    样式.position = 'fixed'
    样式.top = 'var(--间距-2)'
    样式.left = 'var(--间距-2)'
    样式.zIndex = '2000'
    样式.pointerEvents = 'none'
    this.shadow.append(
      创建元素('span', {
        textContent: '样例模式 · 部分业务数据为模拟',
        style: {
          display: 'inline-flex',
          padding: 'var(--间距-1) var(--间距-2)',
          border: '1px solid var(--警告颜色)',
          borderRadius: 'var(--圆角-中)',
          backgroundColor: 'var(--面板背景颜色)',
          color: 'var(--警告前景)',
          boxShadow: 'var(--浅阴影)',
          fontSize: 'var(--字号-小)',
          fontWeight: '700',
          lineHeight: 'var(--行高-紧凑)',
        },
      }),
    )
  }
}
