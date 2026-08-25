import { 组件基类 } from '../../../base/base'
import { 创建元素 } from '../../../global/tools/create-element'

type 横向tab配置 = { 路由键?: string | undefined }
export type tabHorizontal发出事件类型 = { 切换: { 当前索引: number } }
type 监听事件类型 = {}

type 标签页项 = { 标签: string; 内容: HTMLElement; 标识?: string | undefined }

export class 横向tab组件 extends 组件基类<tabHorizontal发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-tabs-horizontal', this)
  }

  private 配置: 横向tab配置
  private 当前索引: number = 0
  private 标签头容器: HTMLDivElement = 创建元素('div')
  private 插槽容器: HTMLDivElement = 创建元素('div')
  private 标签页列表: 标签页项[] = []

  public constructor(配置: 横向tab配置 = {}) {
    super()
    this.配置 = 配置
  }

  public 添加标签页(配置: { 标签: string; 标识?: string | undefined }, 内容: HTMLElement): void {
    this.标签页列表.push({ 标签: 配置.标签, 标识: 配置.标识, 内容 })
    this.appendChild(内容)
  }

  public override async 刷新(): Promise<void> {
    await super.刷新()
    let 目标项 = this.标签页列表[this.当前索引]
    if (目标项 !== undefined) {
      let 内容 = 目标项.内容
      if (内容 instanceof 组件基类) await 内容.刷新()
      for (let 子 of Array.from(内容.children)) if (子 instanceof 组件基类) await 子.刷新()
    }
  }

  protected override async 当加载时(): Promise<void> {
    let 路由键 = this.配置.路由键
    if (typeof 路由键 === 'string') {
      let params = new URLSearchParams(window.location.search)
      let 标识字符串 = params.get(路由键)
      if (标识字符串 !== null) {
        let 索引 = this.标签页列表.findIndex((项) => 项.标识 === 标识字符串)
        if (索引 === -1) {
          let 解析索引 = parseInt(标识字符串)
          if (Number.isNaN(解析索引) === false) 索引 = 解析索引
        }
        if (索引 !== -1 && 索引 >= 0 && 索引 < this.标签页列表.length) {
          this.当前索引 = 索引
        }
      }
    }

    let style = this.获得宿主样式()
    style.display = 'flex'
    style.flexDirection = 'column'
    style.width = '100%'
    style.height = '100%'

    this.标签头容器.style.display = 'flex'
    this.标签头容器.style.borderBottom = '1px solid var(--边框颜色)'
    this.标签头容器.style.gap = '15px'
    this.标签头容器.style.padding = '0.8em 1.8em'
    this.标签头容器.style.alignItems = 'center'
    this.标签头容器.style.background = 'var(--tab-头部背景)'
    this.标签头容器.style.backdropFilter = 'blur(10px)'
    this.标签头容器.style.overflowX = 'auto'
    this.标签头容器.style.flexShrink = '0'
    // 隐藏滚动条但保留滚动功能
    this.标签头容器.style.scrollbarWidth = 'none' // Firefox
    // @ts-ignore
    this.标签头容器.style.msOverflowStyle = 'none' // IE/Edge

    this.插槽容器.style.flex = '1'
    this.插槽容器.style.display = 'flex'
    this.插槽容器.style.flexDirection = 'column'
    this.插槽容器.style.overflow = 'hidden'

    let 插槽: HTMLSlotElement = 创建元素('slot')
    this.插槽容器.appendChild(插槽)

    this.shadow.appendChild(this.标签头容器)
    this.shadow.appendChild(this.插槽容器)

    this.更新UI()
  }

  private 更新UI(): void {
    this.标签头容器.innerHTML = ''

    this.标签页列表.forEach((项, idx) => {
      let 选中 = idx === this.当前索引
      let 按钮 = 创建元素('button', {
        textContent: 项.标签,
        style: {
          padding: '0.55em 1.3em',
          border: '1px solid transparent',
          borderRadius: '10px',
          background: 选中 ? 'var(--tab-激活背景)' : 'transparent',
          borderColor: 选中 ? 'var(--tab-激活边框)' : 'transparent',
          color: 选中 ? 'var(--tab-激活文字)' : 'var(--tab-未激活文字)',
          fontWeight: '600',
          fontSize: '0.92em',
          cursor: 'pointer',
          userSelect: 'none',
          outline: 'none',
          boxShadow: 选中 ? '0 4px 15px var(--tab-阴影)' : 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        },
      })

      if (选中 === false) {
        按钮.onmouseenter = (): void => {
          按钮.style.backgroundColor = 'var(--tab-悬浮背景)'
          按钮.style.color = 'var(--tab-悬浮文字)'
          按钮.style.transform = 'translateY(-1px)'
        }
        按钮.onmouseleave = (): void => {
          按钮.style.backgroundColor = 'transparent'
          按钮.style.color = 'var(--tab-未激活文字)'
          按钮.style.transform = 'translateY(0)'
        }
      } else {
        按钮.onmouseenter = (): void => {
          按钮.style.transform = 'translateY(-1px)'
          按钮.style.boxShadow = '0 6px 20px var(--tab-阴影)'
        }
        按钮.onmouseleave = (): void => {
          按钮.style.transform = 'translateY(0)'
          按钮.style.boxShadow = '0 4px 15px var(--tab-阴影)'
        }
      }

      按钮.onclick = async (): Promise<void> => {
        await this.切换标签(idx)
      }

      this.标签头容器.appendChild(按钮)
    })

    this.标签页列表.forEach((项, idx) => {
      if (idx === this.当前索引) {
        项.内容.style.display = 'flex'
        项.内容.style.flex = '1'
        项.内容.style.flexDirection = 'column'
        项.内容.style.minHeight = '0'
        项.内容.style.minWidth = '0'
        let 已经有overflow样式: boolean =
          项.内容.style.overflow !== '' || 项.内容.style.overflowY !== '' || 项.内容.style.overflowX !== ''
        if (已经有overflow样式 === false) {
          项.内容.style.overflow = 'auto'
        }
      } else {
        项.内容.style.display = 'none'
      }
    })
  }

  private async 切换标签(index: number): Promise<void> {
    let 目标项 = this.标签页列表[index]

    if (this.当前索引 !== index) {
      this.当前索引 = index
      this.更新UI()

      let 路由键 = this.配置.路由键
      if (typeof 路由键 === 'string') {
        let params = new URLSearchParams(window.location.search)
        let 值 = 目标项?.标识 ?? index.toString()
        params.set(路由键, 值)
        let newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`
        window.history.replaceState(null, '', newUrl)
      }
      this.派发事件('切换', { 当前索引: index })
    }

    if (目标项 !== undefined) {
      let 内容 = 目标项.内容
      if (内容 instanceof 组件基类) await 内容.刷新()
      for (let 子 of Array.from(内容.children)) if (子 instanceof 组件基类) await 子.刷新()
    }
  }

  public async 设置当前索引(index: number): Promise<void> {
    await this.切换标签(index)
  }
}
