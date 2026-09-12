import { 组件基类 } from '../../../base/base'
import { 浮层管理器, type 浮层句柄 } from '../../../global/manager/overlay-manager'
import { 创建元素, 应用宿主样式, 应用样式 } from '../../../global/tools/create-element'
import { 文本按钮 } from '../base/base-button'
import { 创建图标 } from '../base/icon'

export type 抽屉方向 = '左' | '右' | '底部'
export type 抽屉配置 = { 标题?: string; 方向?: 抽屉方向; 尺寸?: string; 可关闭?: boolean }
type 抽屉事件 = { 打开: void; 关闭: void }
let 抽屉序号 = 0

export class 抽屉组件 extends 组件基类<抽屉事件, {}> {
  static {
    this.注册组件('lsby-drawer', this)
  }

  private 配置: 抽屉配置
  private 内容: Node | null = null
  private 浮层句柄: 浮层句柄 | null = null
  private 面板 = 创建元素('section', { tabIndex: -1 })
  private 内容容器 = 创建元素('div')
  private 标题标识: string

  public constructor(配置: 抽屉配置 = {}) {
    super()
    抽屉序号 += 1
    this.标题标识 = `lsby-drawer-title-${抽屉序号}`
    this.配置 = 配置
  }

  protected override 当加载时(): void {
    let 宿主样式 = this.获得宿主样式()
    宿主样式.display = this.浮层句柄 === null ? 'none' : 'block'
    应用宿主样式(宿主样式, { position: 'fixed', inset: '0' })
    let 遮罩 = 创建元素('div', { style: { position: 'absolute', inset: '0', backgroundColor: 'var(--遮罩颜色)' } })
    this.面板.setAttribute('role', 'dialog')
    this.面板.setAttribute('aria-modal', 'true')
    this.面板.setAttribute('aria-labelledby', this.标题标识)
    this.应用面板样式()
    let 头部 = 创建元素('header', {
      style: {
        minHeight: '52px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--间距-3)',
        padding: '0 var(--间距-4)',
        borderBottom: '1px solid var(--边框颜色)',
      },
    })
    头部.append(创建元素('strong', { id: this.标题标识, textContent: this.配置.标题 ?? '抽屉' }))
    if (this.配置.可关闭 !== false) {
      头部.append(
        new 文本按钮({
          图标: 创建图标('close'),
          标题: '关闭抽屉',
          自动加载: false,
          点击处理函数: async (): Promise<void> => await this.关闭(),
        }),
      )
    }
    应用样式(this.内容容器, { minHeight: '0', flex: '1', overflow: 'auto', padding: 'var(--间距-4)' })
    this.内容容器.replaceChildren()
    if (this.内容 !== null) this.内容容器.append(this.内容)
    else this.内容容器.append(创建元素('slot'))
    this.面板.replaceChildren(头部, this.内容容器)
    this.shadow.append(遮罩, this.面板)
  }

  public 设置内容(内容: Node): void {
    this.内容 = 内容
    if (this.内容容器.isConnected === true) this.内容容器.replaceChildren(内容)
  }

  public 打开(): void {
    if (this.浮层句柄 !== null) return
    this.获得宿主样式().display = 'block'
    this.浮层句柄 = 浮层管理器.打开({
      根元素: this,
      内容元素: this.面板,
      模态: true,
      允许Escape关闭: this.配置.可关闭 !== false,
      外部关闭: this.配置.可关闭 !== false ? '仅遮罩' : '不关闭',
      初始焦点: this.面板,
      请求关闭: async (): Promise<void> => await this.关闭(),
    })
    this.派发事件('打开', undefined)
  }

  public async 关闭(): Promise<void> {
    let 句柄 = this.浮层句柄
    if (句柄 === null) return
    this.浮层句柄 = null
    await 句柄.关闭()
    this.获得宿主样式().display = 'none'
    this.派发事件('关闭', undefined)
  }

  public 是否打开(): boolean {
    return this.浮层句柄 !== null
  }

  protected override async 当卸载时(): Promise<void> {
    let 句柄 = this.浮层句柄
    this.浮层句柄 = null
    await 句柄?.关闭()
  }

  private 应用面板样式(): void {
    let 方向 = this.配置.方向 ?? '右'
    let 是底部 = 方向 === '底部'
    应用样式(this.面板, {
      position: 'absolute',
      top: 是底部 ? 'auto' : '0',
      right: 方向 === '右' || 是底部 ? '0' : 'auto',
      bottom: '0',
      left: 方向 === '左' || 是底部 ? '0' : 'auto',
      width: 是底部 ? '100%' : (this.配置.尺寸 ?? 'min(420px, 90vw)'),
      height: 是底部 ? (this.配置.尺寸 ?? 'min(420px, 70vh)') : '100%',
      maxWidth: '100vw',
      maxHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      backgroundColor: 'var(--卡片背景颜色)',
      color: 'var(--文字颜色)',
      boxShadow: 'var(--深阴影)',
    })
  }
}
