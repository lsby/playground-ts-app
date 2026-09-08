import { 组件基类 } from '../../../base/base'
import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'
import { 增强样式类型 } from '../../../global/types/style'

type 卡片配置 = { 标题?: string; 描述?: string; 内容?: Node; 操作区?: Node; 宿主样式?: 增强样式类型 }

export class 卡片组件 extends 组件基类<{}, {}> {
  static {
    this.注册组件('lsby-card', this)
  }
  private 配置: 卡片配置
  public constructor(配置: 卡片配置 = {}) {
    super()
    this.配置 = 配置
  }
  protected override 当加载时(): void {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)
    let 卡片 = 创建元素('section', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--间距-4)',
        padding: 'var(--间距-5)',
        border: '1px solid var(--边框颜色)',
        borderRadius: 'var(--圆角-大)',
        backgroundColor: 'var(--卡片背景颜色)',
        boxShadow: 'var(--浅阴影)',
      },
    })
    if (this.配置.标题 !== undefined || this.配置.描述 !== undefined || this.配置.操作区 !== undefined) {
      let 头部 = 创建元素('header', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--间距-4)' },
      })
      let 文本区 = 创建元素('div', { style: { minWidth: '0' } })
      if (this.配置.标题 !== undefined)
        文本区.append(
          创建元素('h2', { textContent: this.配置.标题, style: { margin: '0', fontSize: 'var(--字号-标题)' } }),
        )
      if (this.配置.描述 !== undefined)
        文本区.append(
          创建元素('p', {
            textContent: this.配置.描述,
            style: { margin: 'var(--间距-1) 0 0', color: 'var(--次要文字颜色)' },
          }),
        )
      头部.append(文本区)
      if (this.配置.操作区 !== undefined) 头部.append(this.配置.操作区)
      卡片.append(头部)
    }
    let 内容区 = 创建元素('div')
    if (this.配置.内容 !== undefined) 内容区.append(this.配置.内容)
    else 内容区.append(创建元素('slot'))
    卡片.append(内容区)
    this.shadow.append(卡片)
  }
}
