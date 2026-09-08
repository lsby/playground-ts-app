import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 普通按钮 } from '../general/base/base-button'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 首页组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-index', this)
  }

  protected override 当加载时(): void {
    let 页面 = 创建元素('main', {
      style: {
        width: 'min(960px, calc(100% - 32px))',
        margin: '0 auto',
        padding: 'var(--间距-6) 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--间距-4)',
      },
    })
    let 头部 = 创建元素('header', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--间距-3)' },
    })
    头部.append(
      创建元素('h1', { textContent: '项目首页', style: { margin: '0' } }),
      new 普通按钮({
        文本: '退出登录',
        点击处理函数: (): void => {
          API管理器.清除token()
          window.location.assign('/login.html')
        },
      }),
    )
    let 内容 = 创建元素('section', {
      style: {
        minHeight: '280px',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--间距-6)',
        border: '1px dashed var(--边框颜色)',
        borderRadius: 'var(--圆角-大)',
        color: 'var(--次要文字颜色)',
      },
    })
    内容.append(创建元素('p', { textContent: '在 src/web/components/project/ 中开始编写你的业务页面。' }))
    页面.append(头部, 内容)
    this.shadow.append(页面)
  }
}
