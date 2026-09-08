import { 组件基类 } from '../../../base/base'
import { 创建元素 } from '../../../global/tools/create-element'

export type 状态类型 = '默认' | '成功' | '警告' | '错误' | '信息'
type 状态配置 = { 文本?: string; 类型?: 状态类型 }
let 颜色映射: Record<状态类型, string> = {
  默认: 'var(--次要文字颜色)',
  成功: 'var(--成功颜色)',
  警告: 'var(--警告颜色)',
  错误: 'var(--错误颜色)',
  信息: 'var(--信息颜色)',
}

export class 状态徽标 extends 组件基类<{}, {}> {
  static {
    this.注册组件('lsby-status-badge', this)
  }
  private 配置: 状态配置
  public constructor(配置: 状态配置 = {}) {
    super()
    this.配置 = 配置
  }
  protected override 当加载时(): void {
    let 颜色 = 颜色映射[this.配置.类型 ?? '默认']
    this.shadow.append(
      创建元素('span', {
        textContent: this.配置.文本 ?? '',
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          width: 'fit-content',
          padding: '2px var(--间距-2)',
          border: `1px solid ${颜色}`,
          borderRadius: '999px',
          color: 颜色,
          fontSize: 'var(--字号-小)',
          lineHeight: 'var(--行高-紧凑)',
        },
      }),
    )
  }
}

export class 加载指示器 extends 组件基类<{}, {}> {
  static {
    this.注册组件('lsby-loading-indicator', this)
  }
  protected override 当加载时(): void {
    this.setAttribute('role', 'status')
    this.setAttribute('aria-label', '加载中')
    let 圆环 = 创建元素('span', {
      style: {
        display: 'inline-block',
        width: '20px',
        height: '20px',
        border: '2px solid var(--边框颜色)',
        borderTopColor: 'var(--主色调)',
        borderRadius: '50%',
      },
    })
    圆环.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
      duration: 700,
      iterations: Infinity,
    })
    this.shadow.append(圆环)
  }
}
