import { 组件基类 } from '../../base/base'
import { 右键菜单管理器 } from '../../global/manager/context-menu-manager'
import { 显示对话框 } from '../../global/manager/dialog-manager'
import { 显示模态框 } from '../../global/manager/modal-manager'
import { 成功提示, 显示吐司 } from '../../global/manager/toast-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 主要按钮, 危险按钮, 普通按钮 } from '../general/base/base-button'
import { 卡片组件 } from '../general/base/card'
import { 加载指示器, 状态徽标 } from '../general/base/status'
import { 表单 } from '../general/form/form'
import { 复选框 } from '../general/form/form-checkbox'
import { 复选框组 } from '../general/form/form-checkbox-group'
import { 数字输入框, 普通输入框 } from '../general/form/form-input'
import { 多选下拉框 } from '../general/form/form-multi-select'
import { 单选框组 } from '../general/form/form-radio-group'
import { 普通下拉框 } from '../general/form/form-select'
import { 开关组件 } from '../general/form/form-switch'
import { 自动伸缩文本框 } from '../general/form/form-textarea'
import { 横向tab组件 } from '../general/tabs/tabs-horizontal'
import { 演示能力组件 } from './capability-demo'
import { 演示对话框组件 } from './dialog-demo'
import { 演示用户管理组件 } from './user-management-demo'

type 发出事件类型 = {}
type 监听事件类型 = {}
type 资料数据 = {
  name: string
  quantity: string
  category: string
  mode: string
  confirmed: boolean
  features: string[]
  tags: string[]
  description: string
  switchDemo: boolean
}

export class 演示应用组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-demo-app', this)
  }

  protected override 当加载时(): void {
    let 页面 = 创建元素('main', {
      style: {
        width: 'min(1180px, calc(100% - 32px))',
        margin: '0 auto',
        padding: 'var(--间距-6) 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--间距-6)',
      },
    })
    let 头部 = 创建元素('header')
    头部.append(
      创建元素('h1', { textContent: '可运行的组件示例', style: { margin: '0' } }),
      创建元素('p', { textContent: '每个交互案例都由自动化测试约束。' }),
    )
    let 标签页 = new 横向tab组件({ 路由键: 'tab' })
    标签页.添加标签页({ 标签: '基础组件', 标识: 'base' }, this.创建标签内容(this.创建按钮区(), this.创建状态区()))
    标签页.添加标签页({ 标签: '表单组件', 标识: 'form' }, this.创建标签内容(this.创建表单区()))
    标签页.添加标签页({ 标签: '数据与通信', 标识: 'data' }, this.创建标签内容(new 演示能力组件({ 分组: '数据与通信' })))
    标签页.添加标签页(
      { 标签: '浮层反馈', 标识: 'overlay' },
      this.创建标签内容(this.创建浮层区(), new 演示能力组件({ 分组: '浮层反馈' })),
    )
    标签页.添加标签页(
      { 标签: '业务示例', 标识: 'business' },
      this.创建标签内容(this.创建业务区(), new 演示能力组件({ 分组: '业务扩展' })),
    )
    标签页.添加标签页(
      { 标签: '跨端能力', 标识: 'cross-platform' },
      this.创建标签内容(new 演示能力组件({ 分组: '跨端能力' })),
    )
    页面.append(头部, 标签页)
    this.shadow.append(页面)
  }

  private 创建标签内容(...内容列表: HTMLElement[]): HTMLDivElement {
    let 内容 = 创建元素('div', {
      style: {
        width: '100%',
        boxSizing: 'border-box',
        padding: 'var(--间距-5) 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--间距-6)',
      },
    })
    内容.append(...内容列表)
    return 内容
  }

  private 创建状态区(): HTMLElement {
    let 内容 = 创建元素('div', {
      style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--间距-2)' },
    })
    内容.append(
      new 状态徽标({ 文本: '正常', 类型: '成功' }),
      new 状态徽标({ 文本: '待处理', 类型: '警告' }),
      new 状态徽标({ 文本: '失败', 类型: '错误' }),
      new 加载指示器(),
    )
    return this.创建案例卡('状态与加载', 内容)
  }

  private 创建按钮区(): HTMLElement {
    let 内容 = 创建元素('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--间距-2)' } })
    内容.append(
      new 普通按钮({ 文本: '普通按钮' }),
      new 主要按钮({ 文本: '主要按钮' }),
      new 危险按钮({ 文本: '危险按钮' }),
      new 普通按钮({ 文本: '禁用按钮', 禁用: true }),
      new 主要按钮({
        文本: '异步加载',
        点击处理函数: async (): Promise<void> => await new Promise((resolve) => setTimeout(resolve, 500)),
      }),
    )
    return this.创建案例卡('按钮', 内容)
  }

  private 创建表单区(): HTMLElement {
    let 多选下拉 = new 多选下拉框({
      占位符: '请选择标签',
      打开处理函数: (): void => {
        多选下拉.刷新列表([
          { 文字: '前端', value: 'frontend' },
          { 文字: '后端', value: 'backend' },
          { 文字: '测试', value: 'testing' },
        ])
      },
    })
    let 表单实例 = new 表单<资料数据>({
      项列表: [
        { 键: 'name', 标签: '普通文本演示', 组件: new 普通输入框(), 必填: true },
        { 键: 'quantity', 标签: '数字输入演示', 组件: new 数字输入框({ 最小值: '0', 步长: '1' }) },
        {
          键: 'category',
          标签: '下拉选择演示',
          组件: new 普通下拉框({
            占位符: '请选择分类',
            选项列表: [
              { 值: 'base', 文本: '基础组件' },
              { 值: 'business', 文本: '业务组件' },
            ],
          }),
        },
        {
          键: 'mode',
          标签: '单选框组演示',
          组件: new 单选框组({ 选项列表: ['标准', '紧凑'], 值: '标准', 方向: '横' }),
        },
        { 键: 'confirmed', 标签: '复选框演示', 组件: new 复选框({ 标签: '确认选项' }) },
        { 键: 'features', 标签: '复选框组演示', 组件: new 复选框组({ 选项列表: ['表格', '表单', '浮层'] }) },
        { 键: 'tags', 标签: '多选下拉演示', 组件: 多选下拉 },
        { 键: 'switchDemo', 标签: '布尔开关演示', 组件: new 开关组件() },
        {
          键: 'description',
          标签: '自动伸缩文本框演示',
          组件: new 自动伸缩文本框({ 占位符: '请输入多行内容', 回车提交: false }),
          宽度: 2,
        },
      ],
    })
    let 内容 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--间距-3)' } })
    内容.append(
      表单实例,
      new 主要按钮({
        文本: '验证并提交',
        点击处理函数: async (): Promise<void> => {
          await 表单实例.提交((数据): void => {
            let 数据内容 = 创建元素('pre', {
              textContent: JSON.stringify(数据, null, 2),
              style: {
                margin: '0',
                padding: 'var(--间距-3)',
                overflow: 'auto',
                borderRadius: 'var(--圆角-中)',
                backgroundColor: 'var(--面板背景颜色)',
                color: 'var(--文字颜色)',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              },
            })
            显示模态框({ 标题: '表单提交数据', 可关闭: true, 宽度: '560px', 高度: '480px' }, 数据内容)
          })
        },
      }),
    )
    return this.创建案例卡('强类型表单', 内容)
  }

  private 创建浮层区(): HTMLElement {
    let 内容 = 创建元素('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
        alignItems: 'flex-start',
        gap: 'var(--间距-4)',
      },
    })
    let 通用浮层组 = 创建元素('section', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--间距-3)',
        padding: 'var(--间距-4)',
        border: '1px solid var(--边框颜色)',
        borderRadius: 'var(--圆角-中)',
        backgroundColor: 'var(--面板背景颜色)',
      },
    })
    通用浮层组.append(
      创建元素('h3', { textContent: '通用浮层', style: { margin: '0' } }),
      创建元素('p', {
        textContent: '模态框、通知和上下文菜单。',
        style: { margin: '0', color: 'var(--次要文字颜色)' },
      }),
    )
    let 通用按钮区 = 创建元素('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--间距-2)' } })
    let 右键目标 = new 普通按钮({ 文本: '右键打开菜单' })
    右键目标.oncontextmenu = (event: MouseEvent): void => {
      event.preventDefault()
      右键菜单管理器
        .获得实例()
        .显示菜单(event.clientX, event.clientY, [
          { 文本: '执行操作', 回调: (): void => 成功提示('已执行菜单操作') },
          '分隔符',
          { 文本: '不可用', 禁用: true, 回调: (): void => {} },
        ])
    }
    通用按钮区.append(
      new 普通按钮({
        文本: '打开对话框',
        点击处理函数: async (): Promise<void> => await 显示对话框('对话框具有焦点约束和恢复能力。'),
      }),
      new 普通按钮({
        文本: '打开模态框',
        点击处理函数: (): void => {
          显示模态框(
            { 标题: '模态框示例', 宽度: '520px', 高度: '320px' },
            创建元素('div', { textContent: '模态框支持堆叠、最大化和安全关闭。' }),
          )
        },
      }),
      new 普通按钮({ 文本: '顶部通知', 点击处理函数: (): void => 显示吐司('顶部通知', { 位置: 'top' }) }),
      new 普通按钮({ 文本: '底部通知', 点击处理函数: (): void => 显示吐司('底部通知', { 位置: 'bottom' }) }),
      右键目标,
    )
    通用浮层组.append(通用按钮区)
    let 对话框组 = 创建元素('section', {
      style: {
        padding: 'var(--间距-4)',
        border: '1px solid var(--边框颜色)',
        borderRadius: 'var(--圆角-中)',
        backgroundColor: 'var(--面板背景颜色)',
      },
    })
    对话框组.append(new 演示对话框组件())
    内容.append(通用浮层组, 对话框组)
    return this.创建案例卡('浮层与反馈', 内容)
  }

  private 创建业务区(): HTMLElement {
    return this.创建案例卡('用户管理业务示例', new 演示用户管理组件())
  }
  private 创建案例卡(标题: string, 内容: HTMLElement): HTMLElement {
    return new 卡片组件({ 标题, 内容 })
  }
}
