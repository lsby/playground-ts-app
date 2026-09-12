import { 组件基类 } from '../../../base/base'
import { 创建元素 } from '../../../global/tools/create-element'
import { 创建图标 } from './icon'

export type 折叠面板项 = { 标题: string; 内容: Node; 禁用?: boolean; 初始展开?: boolean }
export type 折叠面板配置 = { 项列表: readonly 折叠面板项[]; 允许多项展开?: boolean }
type 折叠面板事件 = { 切换: { 索引: number; 展开: boolean } }

let 折叠面板序号 = 0

export class 折叠面板组件 extends 组件基类<折叠面板事件, {}> {
  static {
    this.注册组件('lsby-accordion', this)
  }

  private 配置: 折叠面板配置
  private 按钮列表: HTMLButtonElement[] = []
  private 面板列表: HTMLDivElement[] = []
  private 展开集合 = new Set<number>()
  private 标识前缀: string

  public constructor(配置: 折叠面板配置 = { 项列表: [] }) {
    super()
    折叠面板序号 += 1
    this.标识前缀 = `lsby-accordion-${折叠面板序号}`
    this.配置 = 配置
    配置.项列表.forEach((项, 索引): void => {
      if (项.初始展开 === true && (配置.允许多项展开 === true || this.展开集合.size === 0)) this.展开集合.add(索引)
    })
  }

  protected override 当加载时(): void {
    this.按钮列表 = []
    this.面板列表 = []
    let 容器 = 创建元素('div', {
      style: { overflow: 'hidden', border: '1px solid var(--边框颜色)', borderRadius: 'var(--圆角-中)' },
    })
    this.配置.项列表.forEach((项, 索引): void => {
      let 按钮标识 = `${this.标识前缀}-button-${索引}`
      let 面板标识 = `${this.标识前缀}-panel-${索引}`
      let 按钮 = 创建元素('button', {
        id: 按钮标识,
        type: 'button',
        disabled: 项.禁用 ?? false,
        style: {
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--间距-3)',
          padding: 'var(--间距-3) var(--间距-4)',
          border: '0',
          borderTop: 索引 === 0 ? '0' : '1px solid var(--边框颜色)',
          borderRadius: '0',
          backgroundColor: 'var(--面板背景颜色)',
          color: 'var(--文字颜色)',
          cursor: 项.禁用 === true ? 'not-allowed' : 'pointer',
          textAlign: 'left',
        },
      })
      let 箭头 = 创建图标('chevron-down', 16)
      箭头.style.transition = 'transform var(--动画-正常)'
      按钮.append(创建元素('span', { textContent: 项.标题 }), 箭头)
      按钮.setAttribute('aria-controls', 面板标识)
      let 面板 = 创建元素('div', {
        id: 面板标识,
        role: 'region',
        style: { padding: 'var(--间距-4)', borderTop: '1px solid var(--边框颜色)' },
      })
      面板.setAttribute('aria-labelledby', 按钮标识)
      面板.append(项.内容)
      按钮.onclick = (): void => this.设置展开(索引, this.展开集合.has(索引) === false)
      容器.append(按钮, 面板)
      this.按钮列表.push(按钮)
      this.面板列表.push(面板)
      this.同步项状态(索引)
    })
    this.shadow.append(容器)
  }

  public 设置展开(索引: number, 展开: boolean): void {
    let 项 = this.配置.项列表[索引]
    if (项 === undefined || 项.禁用 === true || this.展开集合.has(索引) === 展开) return
    if (展开 === true && this.配置.允许多项展开 !== true) {
      for (let 已展开索引 of [...this.展开集合]) {
        this.展开集合.delete(已展开索引)
        this.同步项状态(已展开索引)
      }
    }
    if (展开 === true) this.展开集合.add(索引)
    else this.展开集合.delete(索引)
    this.同步项状态(索引)
    this.派发事件('切换', { 索引, 展开 })
  }

  public 获得展开索引(): number[] {
    return [...this.展开集合]
  }

  private 同步项状态(索引: number): void {
    let 按钮 = this.按钮列表[索引]
    let 面板 = this.面板列表[索引]
    if (按钮 === undefined || 面板 === undefined) return
    let 展开 = this.展开集合.has(索引)
    按钮.setAttribute('aria-expanded', 展开 ? 'true' : 'false')
    面板.hidden = 展开 === false
    let 箭头 = 按钮.lastElementChild
    if (箭头 instanceof SVGSVGElement) 箭头.style.transform = 展开 ? 'rotate(180deg)' : 'rotate(0deg)'
  }
}
