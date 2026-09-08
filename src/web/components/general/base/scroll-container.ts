import { 组件基类 } from '../../../base/base'
import { 获得滚动条样式 } from '../../../global/style/scrollbar'
import { 创建元素 } from '../../../global/tools/create-element'

export type 滚动方向 = 'vertical' | 'horizontal' | 'both'

type 滚动容器配置 = { 方向?: 滚动方向 }
type 滚动容器发出事件类型 = {}
type 滚动容器监听事件类型 = {}

export class 滚动容器 extends 组件基类<滚动容器发出事件类型, 滚动容器监听事件类型> {
  static {
    this.注册组件('lsby-scroll-container', this)
  }

  private 配置: 滚动容器配置
  private 滚动区域: HTMLDivElement = 创建元素('div')

  public constructor(配置: 滚动容器配置 = {}) {
    super()
    this.配置 = 配置
  }

  public 获得滚动元素(): HTMLDivElement {
    return this.滚动区域
  }

  protected override async 当加载时(): Promise<void> {
    let 宿主样式 = this.获得宿主样式()
    if (宿主样式.display !== 'none') 宿主样式.display = 'block'
    宿主样式.width = '100%'
    宿主样式.height = '100%'
    宿主样式.minWidth = '0'
    宿主样式.minHeight = '0'
    宿主样式.overflow = 'hidden'

    this.滚动区域.className = 'scroll-container'
    this.滚动区域.style.boxSizing = 'border-box'
    this.滚动区域.style.width = '100%'
    this.滚动区域.style.height = '100%'
    this.滚动区域.style.minWidth = '0'
    this.滚动区域.style.minHeight = '0'

    let 方向 = this.配置.方向 ?? 'vertical'
    switch (方向) {
      case 'vertical':
        this.滚动区域.style.overflowX = 'hidden'
        this.滚动区域.style.overflowY = 'auto'
        break
      case 'horizontal':
        this.滚动区域.style.overflowX = 'auto'
        this.滚动区域.style.overflowY = 'hidden'
        break
      case 'both':
        this.滚动区域.style.overflow = 'auto'
        break
    }

    this.滚动区域.replaceChildren(创建元素('slot'))
    let 样式 = 创建元素('style', { textContent: 获得滚动条样式('.scroll-container') })
    this.shadow.append(样式, this.滚动区域)
  }
}
