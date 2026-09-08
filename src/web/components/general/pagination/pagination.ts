import { 组件基类 } from '../../../base/base'
import { 创建元素 } from '../../../global/tools/create-element'
import { 普通按钮 } from '../base/base-button'

export type 数据表分页配置 = { 当前页码: number; 每页数量: number; 总数量: number }

type 发出事件类型 = { 页码变化: { 页码: number } }

type 监听事件类型 = {}

export class 分页组件 extends 组件基类<发出事件类型, 监听事件类型> {
  public on页码变化?: (数据: { 页码: number }) => void | Promise<void>

  static {
    this.注册组件('lsby-pagination', this)
  }

  private 分页配置: 数据表分页配置
  private 禁用: boolean

  public constructor(分页配置: 数据表分页配置, 禁用: boolean = false) {
    super()
    this.分页配置 = 分页配置
    this.禁用 = 禁用
  }

  public 更新配置(分页配置: 数据表分页配置, 禁用: boolean): void {
    this.分页配置 = 分页配置
    this.禁用 = 禁用
    this.渲染()
  }

  private 渲染(): void {
    let { 当前页码, 每页数量, 总数量 } = this.分页配置
    let 总页数 = Math.max(1, Math.ceil(总数量 / 每页数量))
    let 禁用 = this.禁用

    let 分页容器 = 创建元素('div', {
      style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px 0' },
    })
    分页容器.setAttribute('role', 'navigation')
    分页容器.setAttribute('aria-label', '表格分页')

    // 上一页按钮
    let 上一页按钮 = new 普通按钮({
      文本: '上一页',
      自动加载: false,
      禁用: 当前页码 <= 1 || 禁用,
      点击处理函数: async (): Promise<void> => {
        if (当前页码 > 1) {
          let 新页码 = 当前页码 - 1
          await this.on页码变化?.({ 页码: 新页码 })
          this.派发事件('页码变化', { 页码: 新页码 })
        }
      },
    })
    分页容器.appendChild(上一页按钮)

    // 页码显示
    let 页码显示 = 创建元素('span', {
      textContent: `第 ${当前页码} 页 / 共 ${总页数} 页 (总共 ${总数量} 条)`,
      style: { margin: '0 8px', color: 'var(--color-text-secondary)' },
    })
    分页容器.appendChild(页码显示)

    // 下一页按钮
    let 下一页按钮 = new 普通按钮({
      文本: '下一页',
      自动加载: false,
      禁用: 当前页码 >= 总页数 || 禁用,
      点击处理函数: async (): Promise<void> => {
        if (当前页码 < 总页数) {
          let 新页码 = 当前页码 + 1
          await this.on页码变化?.({ 页码: 新页码 })
          this.派发事件('页码变化', { 页码: 新页码 })
        }
      },
    })
    分页容器.appendChild(下一页按钮)

    this.清空影子dom()
    this.shadow.appendChild(分页容器)
  }

  protected override async 当加载时(): Promise<void> {
    this.渲染()
  }
}
