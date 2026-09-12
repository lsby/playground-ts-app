import { 组件基类 } from '../../../base/base'
import { 创建元素 } from '../../../global/tools/create-element'
import { 文本按钮 } from './base-button'
import { 创建图标, type 图标名称 } from './icon'

export type 反馈类型 = '成功' | '警告' | '错误' | '信息'

type 提示条事件 = { 关闭: void }
export type 提示条配置 = { 标题?: string; 内容: string; 类型?: 反馈类型; 可关闭?: boolean }

let 反馈外观映射: Record<反馈类型, { 图标: 图标名称; 前景: string; 背景: string }> = {
  成功: { 图标: 'check', 前景: 'var(--成功前景)', 背景: 'color-mix(in srgb, var(--成功颜色) 10%, transparent)' },
  警告: { 图标: 'warning', 前景: 'var(--警告前景)', 背景: 'color-mix(in srgb, var(--警告颜色) 10%, transparent)' },
  错误: { 图标: 'error', 前景: 'var(--错误前景)', 背景: 'color-mix(in srgb, var(--错误颜色) 10%, transparent)' },
  信息: { 图标: 'info', 前景: 'var(--信息前景)', 背景: 'color-mix(in srgb, var(--信息颜色) 10%, transparent)' },
}

export class 提示条组件 extends 组件基类<提示条事件, {}> {
  static {
    this.注册组件('lsby-alert', this)
  }

  private 配置: 提示条配置

  public constructor(配置: 提示条配置 = { 内容: '' }) {
    super()
    this.配置 = 配置
  }

  protected override 当加载时(): void {
    let 类型 = this.配置.类型 ?? '信息'
    let 外观 = 反馈外观映射[类型]
    this.setAttribute('role', 类型 === '错误' || 类型 === '警告' ? 'alert' : 'status')
    this.获得宿主样式().display = this.hidden === true ? 'none' : 'block'
    let 容器 = 创建元素('div', {
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--间距-3)',
        padding: 'var(--间距-3) var(--间距-4)',
        border: `1px solid ${外观.前景}`,
        borderRadius: 'var(--圆角-中)',
        backgroundColor: 外观.背景,
        color: 'var(--文字颜色)',
      },
    })
    let 图标 = 创建图标(外观.图标, 20)
    图标.style.color = 外观.前景
    图标.style.flexShrink = '0'
    let 文本区 = 创建元素('div', { style: { minWidth: '0', flex: '1' } })
    if (this.配置.标题 !== undefined)
      文本区.append(创建元素('strong', { textContent: this.配置.标题, style: { display: 'block' } }))
    文本区.append(创建元素('div', { textContent: this.配置.内容, style: { whiteSpace: 'pre-wrap' } }))
    容器.append(图标, 文本区)
    if (this.配置.可关闭 === true) {
      容器.append(
        new 文本按钮({
          文本: '关闭',
          标题: '关闭提示',
          自动加载: false,
          元素样式: { padding: '0 var(--间距-1)' },
          点击处理函数: (): void => this.关闭(),
        }),
      )
    }
    this.shadow.append(容器)
  }

  public 关闭(): void {
    this.hidden = true
    this.获得宿主样式().display = 'none'
    this.派发事件('关闭', undefined)
  }
}

export type 结果状态配置 = { 标题: string; 描述?: string; 类型?: 反馈类型; 操作区?: Node }

export class 结果状态组件 extends 组件基类<{}, {}> {
  static {
    this.注册组件('lsby-result', this)
  }

  private 配置: 结果状态配置

  public constructor(配置: 结果状态配置 = { 标题: '' }) {
    super()
    this.配置 = 配置
  }

  protected override 当加载时(): void {
    let 外观 = 反馈外观映射[this.配置.类型 ?? '信息']
    let 容器 = 创建元素('section', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--间距-2)',
        padding: 'var(--间距-6) var(--间距-4)',
        textAlign: 'center',
      },
    })
    let 图标 = 创建图标(外观.图标, 36)
    图标.style.color = 外观.前景
    容器.append(图标, 创建元素('h3', { textContent: this.配置.标题, style: { margin: '0' } }))
    if (this.配置.描述 !== undefined)
      容器.append(创建元素('p', { textContent: this.配置.描述, style: { margin: '0', color: 'var(--次要文字颜色)' } }))
    if (this.配置.操作区 !== undefined) 容器.append(this.配置.操作区)
    this.shadow.append(容器)
  }
}

export type 空状态配置 = { 标题?: string; 描述?: string; 操作区?: Node }

export class 空状态组件 extends 结果状态组件 {
  public constructor(配置: 空状态配置 = {}) {
    super({
      标题: 配置.标题 ?? '暂无数据',
      类型: '信息',
      ...(配置.描述 === undefined ? {} : { 描述: 配置.描述 }),
      ...(配置.操作区 === undefined ? {} : { 操作区: 配置.操作区 }),
    })
  }
}

空状态组件.注册组件('lsby-empty-state', 空状态组件)
