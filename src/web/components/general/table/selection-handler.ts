import { 成功提示, 错误提示 } from '../../../global/manager/toast-manager'
import { 数据表列配置, 数据表行键 } from './types'

export type 选择处理器上下文<数据项> = {
  数据列表: 数据项[]
  列配置: 数据表列配置<数据项>[]
  获得行键: (行索引: number) => 数据表行键 | undefined
  表格行元素映射: Map<数据表行键, HTMLTableRowElement>
  表格单元格元素映射: Map<string, HTMLTableCellElement>
}

export class 表格选择管理器<数据项> {
  private 选中行键 = new Set<数据表行键>()
  private 最后点击的单元格: { 行键: 数据表行键; 列: number } | null = null
  private shift选择起点 = -1

  public constructor(private 上下文: 选择处理器上下文<数据项>) {}

  public 获得选中行键(): ReadonlySet<数据表行键> {
    return this.选中行键
  }
  public 获得最后点击的单元格(): { 行键: 数据表行键; 列: number } | null {
    return this.最后点击的单元格
  }
  public 获得是否为多选模式(): boolean {
    return this.选中行键.size > 1
  }

  public 移除已不存在的选择(): void {
    let 存在行键 = new Set<数据表行键>()
    for (let 索引 = 0; 索引 < this.上下文.数据列表.length; 索引 += 1) {
      let 行键 = this.上下文.获得行键(索引)
      if (行键 !== undefined) 存在行键.add(行键)
    }
    for (let 行键 of this.选中行键) if (存在行键.has(行键) === false) this.选中行键.delete(行键)
    if (this.最后点击的单元格 !== null && 存在行键.has(this.最后点击的单元格.行键) === false)
      this.最后点击的单元格 = null
  }

  public 清除选择(): void {
    this.选中行键.clear()
    this.最后点击的单元格 = null
    this.shift选择起点 = -1
  }

  public 处理行点击(行索引: number, ctrl键: boolean, shift键: boolean): void {
    let 行键 = this.上下文.获得行键(行索引)
    if (行键 === undefined) return
    if (shift键 === true && this.shift选择起点 >= 0) {
      let 开始 = Math.min(this.shift选择起点, 行索引)
      let 结束 = Math.max(this.shift选择起点, 行索引)
      this.选中行键.clear()
      for (let 索引 = 开始; 索引 <= 结束; 索引 += 1) {
        let 范围行键 = this.上下文.获得行键(索引)
        if (范围行键 !== undefined) this.选中行键.add(范围行键)
      }
    } else if (ctrl键 === true) {
      if (this.选中行键.has(行键) === true) this.选中行键.delete(行键)
      else this.选中行键.add(行键)
      this.shift选择起点 = 行索引
    } else {
      this.选中行键.clear()
      this.选中行键.add(行键)
      this.shift选择起点 = 行索引
    }
  }

  public 处理单元格点击(行索引: number, 列索引: number, ctrl键: boolean, shift键: boolean): void {
    let 行键 = this.上下文.获得行键(行索引)
    if (行键 === undefined) return
    this.最后点击的单元格 = { 行键, 列: 列索引 }
    this.处理行点击(行索引, ctrl键, shift键)
  }

  public async 复制选中内容(): Promise<void> {
    let 内容 = ''
    if (this.选中行键.size === 1 && this.最后点击的单元格 !== null) {
      let 行索引 = this.获得行索引(this.最后点击的单元格.行键)
      let 行数据 = 行索引 < 0 ? undefined : this.上下文.数据列表[行索引]
      let 列 = this.上下文.列配置[this.最后点击的单元格.列]
      if (行数据 !== undefined && 行数据 !== null && 列 !== undefined) 内容 = this.格式化值(行数据[列.字段名])
    } else if (this.选中行键.size > 0) {
      let 行内容们: string[] = []
      for (let 索引 = 0; 索引 < this.上下文.数据列表.length; 索引 += 1) {
        let 行键 = this.上下文.获得行键(索引)
        let 行 = this.上下文.数据列表[索引]
        if (行键 !== undefined && 行 !== undefined && 行 !== null && this.选中行键.has(行键) === true) {
          行内容们.push(this.上下文.列配置.map((列) => this.格式化值(行[列.字段名])).join('\t'))
        }
      }
      内容 = 行内容们.join('\n')
    }
    if (内容 === '') {
      错误提示('没有选中的内容')
      return
    }
    try {
      await navigator.clipboard.writeText(内容)
      成功提示('已复制到剪贴板')
    } catch (错误) {
      console.error('复制失败:', 错误)
      错误提示('复制失败，请重试')
    }
  }

  public 更新选中状态(): void {
    for (let [行键, 行元素] of this.上下文.表格行元素映射) {
      let 选中 = this.选中行键.has(行键)
      行元素.style.backgroundColor = 选中 === true ? 'var(--选中背景颜色)' : ''
      行元素.setAttribute('aria-selected', 选中 ? 'true' : 'false')
    }
    for (let [键, 单元格] of this.上下文.表格单元格元素映射) {
      let 强调键 =
        this.最后点击的单元格 === null ? '' : `${String(this.最后点击的单元格.行键)}::${this.最后点击的单元格.列}`
      单元格.style.backgroundColor = 键 === 强调键 && this.获得是否为多选模式() === false ? 'var(--强调背景颜色)' : ''
    }
  }

  private 获得行索引(行键: 数据表行键): number {
    return this.上下文.数据列表.findIndex((_, 索引) => this.上下文.获得行键(索引) === 行键)
  }

  private 格式化值(值: unknown): string {
    return 值 === null || 值 === undefined ? 'NULL' : String(值)
  }
}
