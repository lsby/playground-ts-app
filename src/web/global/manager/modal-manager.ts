import { 文本按钮 } from '../../components/general/base/base-button'
import { 创建图标 } from '../../components/general/base/icon'
import { 创建元素 } from '../tools/create-element'
import { 浮层管理器, type 浮层句柄 } from './overlay-manager'

export type 模态框选项 = {
  标题: string
  最大化?: boolean
  可关闭?: boolean
  关闭回调?: () => void | Promise<void>
  宽度?: string
  高度?: string
}

export type 模态框句柄 = { 关闭: () => Promise<void>; 切换最大化: () => void }

type 模态框记录 = {
  句柄: 浮层句柄
  选项: 模态框选项
  框: HTMLDivElement
  遮罩: HTMLDivElement
  最大化按钮: 文本按钮
  已最大化: boolean
  已关闭: boolean
}

let 模态框编号 = 0
let 默认模态框宽度 = 'min(640px, calc(100vw - 32px))'
let 默认模态框高度 = 'auto'

class 模态框管理器 {
  private 栈: 模态框记录[] = []

  public 显示(选项: 模态框选项, 内容: HTMLElement): 模态框句柄 {
    let 记录: 模态框记录 | null = null
    let 请求关闭 = async (): Promise<void> => {
      if (记录 !== null) await this.关闭记录(记录)
    }
    let 请求切换最大化 = (): void => {
      if (记录 !== null) this.切换最大化(记录)
    }
    let 遮罩 = 创建元素('div', {
      style: {
        position: 'fixed',
        inset: '0',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 'var(--间距-4)',
        backgroundColor: 'var(--遮罩颜色)',
        boxSizing: 'border-box',
      },
    })
    let 框 = 创建元素('div', {
      role: 'dialog',
      tabIndex: -1,
      style: {
        width: 选项.宽度 ?? 默认模态框宽度,
        height: 选项.高度 ?? 默认模态框高度,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 32px)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--边框颜色)',
        borderRadius: 'var(--圆角-大)',
        backgroundColor: 'var(--卡片背景颜色)',
        color: 'var(--文字颜色)',
        boxShadow: 'var(--深阴影)',
      },
    })
    框.setAttribute('aria-modal', 'true')
    let 标题编号 = `lsby-modal-title-${++模态框编号}`
    let 头部 = 创建元素('div', {
      style: {
        minHeight: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--间距-3)',
        padding: '0 var(--间距-4)',
        borderBottom: '1px solid var(--边框颜色)',
        backgroundColor: 'var(--面板背景颜色)',
      },
    })
    头部.append(创建元素('strong', { id: 标题编号, textContent: 选项.标题 }))
    框.setAttribute('aria-labelledby', 标题编号)
    let 操作区 = 创建元素('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--间距-1)' } })
    let 最大化按钮 = new 文本按钮({
      图标: 创建图标(选项.最大化 === true ? 'restore' : 'maximize'),
      标题: 选项.最大化 === true ? '还原' : '最大化',
      自动加载: false,
      点击处理函数: 请求切换最大化,
    })
    let 关闭按钮 = new 文本按钮({ 图标: 创建图标('close'), 标题: '关闭', 自动加载: false, 点击处理函数: 请求关闭 })
    操作区.append(最大化按钮)
    if (选项.可关闭 !== false) 操作区.append(关闭按钮)
    头部.append(操作区)
    let 内容容器 = 创建元素('div', { style: { minHeight: '0', flex: '1', overflow: 'auto', padding: 'var(--间距-4)' } })
    内容容器.append(内容)
    框.append(头部, 内容容器)
    遮罩.append(框)

    let 句柄 = 浮层管理器.打开({
      根元素: 遮罩,
      内容元素: 框,
      模态: true,
      允许Escape关闭: 选项.可关闭 !== false,
      外部关闭: 选项.可关闭 !== false ? '仅遮罩' : '不关闭',
      请求关闭,
    })
    记录 = { 句柄, 选项, 框, 遮罩, 最大化按钮, 已最大化: 选项.最大化 ?? false, 已关闭: false }
    this.栈.push(记录)
    if (记录.已最大化 === true) this.应用最大化(记录)
    return { 关闭: async (): Promise<void> => await this.关闭记录(记录), 切换最大化: (): void => this.切换最大化(记录) }
  }

  public async 关闭(): Promise<void> {
    let 记录 = this.栈[this.栈.length - 1]
    if (记录 !== undefined) await this.关闭记录(记录)
  }

  public 是否显示(): boolean {
    return this.栈.length > 0
  }

  private async 关闭记录(记录: 模态框记录): Promise<void> {
    if (记录.已关闭 === true) return
    记录.已关闭 = true
    let 索引 = this.栈.indexOf(记录)
    if (索引 >= 0) this.栈.splice(索引, 1)
    try {
      await 记录.选项.关闭回调?.()
    } finally {
      await 记录.句柄.关闭()
    }
  }

  private 切换最大化(记录: 模态框记录): void {
    记录.已最大化 = 记录.已最大化 === false
    if (记录.已最大化 === true) this.应用最大化(记录)
    else {
      记录.遮罩.style.padding = 'var(--间距-4)'
      记录.框.style.width = 记录.选项.宽度 ?? 默认模态框宽度
      记录.框.style.height = 记录.选项.高度 ?? 默认模态框高度
      记录.框.style.maxWidth = 'calc(100vw - 32px)'
      记录.框.style.maxHeight = 'calc(100vh - 32px)'
      记录.框.style.borderRadius = 'var(--圆角-大)'
      记录.最大化按钮.设置标题('最大化')
      记录.最大化按钮.设置图标(创建图标('maximize'))
    }
  }

  private 应用最大化(记录: 模态框记录): void {
    记录.遮罩.style.padding = '0'
    记录.框.style.width = '100vw'
    记录.框.style.height = '100vh'
    记录.框.style.maxWidth = '100vw'
    记录.框.style.maxHeight = '100vh'
    记录.框.style.borderRadius = '0'
    记录.最大化按钮.设置标题('还原')
    记录.最大化按钮.设置图标(创建图标('restore'))
  }
}

let 模态框实例 = new 模态框管理器()

export function 显示模态框(选项: 模态框选项, 内容: HTMLElement): 模态框句柄 {
  return 模态框实例.显示(选项, 内容)
}

export async function 关闭模态框(): Promise<void> {
  await 模态框实例.关闭()
}

export function 模态框是否显示(): boolean {
  return 模态框实例.是否显示()
}
