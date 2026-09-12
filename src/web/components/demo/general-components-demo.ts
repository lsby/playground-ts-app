import { 组件基类 } from '../../base/base'
import { 等待可取消任务 } from '../../global/tools/abort'
import { 创建元素 } from '../../global/tools/create-element'
import { 折叠面板组件 } from '../general/base/accordion'
import { 主要按钮, 普通按钮 } from '../general/base/base-button'
import { 提示条组件, 空状态组件, 结果状态组件 } from '../general/base/feedback'
import { 文件选择器 } from '../general/file/file-picker'
import { 本地日期时间转UTC, 格式化UTC时间 } from '../general/form/date-time-utils'
import { 组合框, type 组合框选项 } from '../general/form/form-combobox'
import { 日期范围输入框 } from '../general/form/form-date-range'
import { 日期时间输入框, 日期输入框, 时间输入框 } from '../general/form/form-date-time'
import { 抽屉组件 } from '../general/overlay/drawer'

type 发出事件类型 = {}
type 监听事件类型 = {}

let 负责人列表: 组合框选项[] = [
  { 文本: '张三', 值: 'zhang-san' },
  { 文本: '李四', 值: 'li-si' },
  { 文本: '王五', 值: 'wang-wu' },
  { 文本: '禁用账号', 值: 'disabled', 禁用: true },
]

export class 通用组件演示 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-general-components-demo', this)
  }

  protected override 当加载时(): void {
    let 容器 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--间距-6)' } })
    容器.append(this.创建反馈示例(), this.创建选择控件示例(), this.创建文件上传示例(), this.创建抽屉与折叠示例())
    this.shadow.append(容器)
  }

  private 创建反馈示例(): HTMLElement {
    let 容器 = this.创建案例容器('反馈与空状态')
    let 网格 = 创建元素('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        gap: 'var(--间距-3)',
      },
    })
    网格.append(
      new 提示条组件({ 标题: '可关闭提示', 内容: '用于展示需要关注的页面内消息。', 类型: '警告', 可关闭: true }),
      new 结果状态组件({ 标题: '操作已完成', 描述: '结果页面可以放置后续操作。', 类型: '成功' }),
      new 空状态组件({ 描述: '请调整查询条件后重试。' }),
    )
    容器.append(网格)
    return 容器
  }

  private 创建选择控件示例(): HTMLElement {
    let 容器 = this.创建案例容器('日期时间与异步组合框')
    let 网格 = 创建元素('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
        gap: 'var(--间距-4)',
      },
    })
    let 日期 = new 日期输入框({ 可访问名称: '发布日期', 值: '2026-09-12' })
    let 时间 = new 时间输入框({ 可访问名称: '提醒时间', 值: '09:30' })
    let 日期时间 = new 日期时间输入框({ 可访问名称: '本地执行时间', 值: '2026-09-12T10:30' })
    let UTC结果 = 创建元素('output', { style: { color: 'var(--次要文字颜色)' } })
    let 更新UTC结果 = (): void => {
      let UTC值 = 本地日期时间转UTC(日期时间.获得值())
      UTC结果.textContent = UTC值 === null ? '请选择日期时间' : `UTC：${UTC值}；本地显示：${格式化UTC时间(UTC值)}`
    }
    日期时间.监听发出事件('变化', 更新UTC结果)
    更新UTC结果()
    let 范围 = new 日期范围输入框({ 可访问名称: '统计日期', 值: ['2026-09-01', '2026-09-12'] })
    let 组合框结果 = 创建元素('output', { textContent: '尚未选择负责人', style: { color: 'var(--次要文字颜色)' } })
    let 负责人组合框 = new 组合框({
      可访问名称: '负责人',
      占位符: '输入姓名搜索',
      查询防抖毫秒: 80,
      加载选项命令: async (查询, { 信号 }): Promise<readonly 组合框选项[]> => {
        await 等待可取消任务(
          new Promise<void>((完成): void => {
            window.setTimeout(完成, 60)
          }),
          信号,
        )
        return 负责人列表.filter((选项): boolean => 选项.文本.includes(查询.trim()))
      },
    })
    负责人组合框.监听发出事件('变化', (事件): void => {
      组合框结果.textContent = `已选负责人：${事件.detail}`
    })
    网格.append(
      this.创建字段('发布日期', 日期),
      this.创建字段('提醒时间', 时间),
      this.创建字段('日期时间与 UTC', 日期时间, UTC结果),
      this.创建字段('日期范围', 范围),
      this.创建字段('异步负责人搜索', 负责人组合框, 组合框结果),
    )
    容器.append(网格)
    return 容器
  }

  private 创建文件上传示例(): HTMLElement {
    let 容器 = this.创建案例容器('文件选择与可取消上传')
    let 选择器 = new 文件选择器({
      允许多选: true,
      接受类型: '.txt,text/plain',
      最大文件数: 2,
      单文件最大字节: 1024,
      提示文本: '最多 2 个 TXT 文件，单个不超过 1 KB',
      上传命令: async (_文件列表, { 信号, 报告进度 }): Promise<void> => {
        报告进度(40)
        await 等待可取消任务(
          new Promise<void>((完成): void => {
            window.setTimeout(完成, 300)
          }),
          信号,
        )
        报告进度(100)
      },
    })
    容器.append(选择器)
    return 容器
  }

  private 创建抽屉与折叠示例(): HTMLElement {
    let 容器 = this.创建案例容器('抽屉与折叠面板')
    let 抽屉 = new 抽屉组件({ 标题: '详情抽屉', 方向: '右', 尺寸: 'min(440px, 92vw)' })
    let 抽屉内容 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--间距-3)' } })
    抽屉内容.append(
      创建元素('p', { textContent: '抽屉适用于详情、编辑和移动端导航。' }),
      new 普通按钮({ 文本: '抽屉内操作' }),
    )
    抽屉.设置内容(抽屉内容)
    let 打开抽屉 = new 主要按钮({ 文本: '打开详情抽屉', 自动加载: false, 点击处理函数: (): void => 抽屉.打开() })
    let 折叠面板 = new 折叠面板组件({
      项列表: [
        { 标题: '基础配置', 内容: 创建元素('div', { textContent: '基础配置内容' }), 初始展开: true },
        { 标题: '高级配置', 内容: 创建元素('div', { textContent: '高级配置内容' }) },
        { 标题: '不可用配置', 内容: 创建元素('div', { textContent: '不可用内容' }), 禁用: true },
      ],
    })
    容器.append(打开抽屉, 折叠面板)
    return 容器
  }

  private 创建案例容器(标题: string): HTMLElement {
    let 容器 = 创建元素('section', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--间距-4)',
        padding: 'var(--间距-4)',
        border: '1px solid var(--边框颜色)',
        borderRadius: 'var(--圆角-大)',
      },
    })
    容器.append(创建元素('h2', { textContent: 标题, style: { margin: '0' } }))
    return 容器
  }

  private 创建字段(标签: string, 控件: HTMLElement, 说明?: HTMLElement): HTMLDivElement {
    let 容器 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--间距-2)' } })
    容器.append(创建元素('span', { textContent: 标签, style: { fontWeight: '600' } }), 控件)
    if (说明 !== undefined) 容器.append(说明)
    return 容器
  }
}
