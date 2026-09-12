import { 组件基类, 要求组件构造参数 } from '../../../base/base'
import { 创建元素 } from '../../../global/tools/create-element'
import { 普通按钮 } from '../base/base-button'

export type 数据表分页配置 = { 当前页码: number; 每页数量: number; 总数量: number }

type 发出事件类型 = { 页码变化: { 页码: number } }

type 监听事件类型 = {}

export class 分页组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-pagination', this)
  }

  private 分页配置: 数据表分页配置
  private 禁用: boolean
  private 分页容器 = 创建元素('div', {
    style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px 0' },
  })
  private 上一页按钮 = new 普通按钮({ 文本: '上一页', 自动加载: false })
  private 页码显示 = 创建元素('span', { style: { margin: '0 8px', color: 'var(--次要文字颜色)' } })
  private 下一页按钮 = new 普通按钮({ 文本: '下一页', 自动加载: false })

  public constructor(分页配置: 数据表分页配置, 禁用: boolean = false) {
    super()
    this.分页配置 = 要求组件构造参数(分页配置, '分页组件')
    this.禁用 = 禁用
    this.上一页按钮.监听发出事件('点击', (): void => this.请求翻页(-1))
    this.下一页按钮.监听发出事件('点击', (): void => this.请求翻页(1))
    this.分页容器.setAttribute('role', 'navigation')
    this.分页容器.setAttribute('aria-label', '表格分页')
    this.分页容器.append(this.上一页按钮, this.页码显示, this.下一页按钮)
  }

  public 更新配置(分页配置: 数据表分页配置, 禁用: boolean): void {
    this.分页配置 = 分页配置
    this.禁用 = 禁用
    this.同步状态()
  }

  private 同步状态(): void {
    let { 当前页码, 每页数量, 总数量 } = this.分页配置
    let 总页数 = Math.max(1, Math.ceil(总数量 / 每页数量))
    this.上一页按钮.设置禁用(当前页码 <= 1 || this.禁用)
    this.下一页按钮.设置禁用(当前页码 >= 总页数 || this.禁用)
    this.页码显示.textContent = `第 ${当前页码} 页 / 共 ${总页数} 页 (总共 ${总数量} 条)`
  }

  private 请求翻页(变化量: -1 | 1): void {
    let 总页数 = Math.max(1, Math.ceil(this.分页配置.总数量 / this.分页配置.每页数量))
    let 新页码 = Math.min(总页数, Math.max(1, this.分页配置.当前页码 + 变化量))
    if (新页码 !== this.分页配置.当前页码) this.派发事件('页码变化', { 页码: 新页码 })
  }

  protected override 当加载时(): void {
    this.shadow.appendChild(this.分页容器)
    this.同步状态()
  }
}
