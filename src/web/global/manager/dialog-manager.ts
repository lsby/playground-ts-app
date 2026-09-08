import { 主要按钮, 普通按钮 } from '../../components/general/base/base-button'
import { 普通输入框 } from '../../components/general/form/form-input'
import { 创建元素 } from '../tools/create-element'
import { 浮层管理器, type 浮层句柄 } from './overlay-manager'

type 对话框选项 = {
  消息: string
  提示?: string
  输入?: { 默认值?: string; 占位符?: string }
  取消文本?: string
  确定文本?: string
}

let 对话框编号 = 0

function 创建对话框框架(选项: 对话框选项): {
  遮罩: HTMLDivElement
  面板: HTMLDivElement
  按钮容器: HTMLDivElement
  输入框?: 普通输入框
} {
  let 遮罩 = 创建元素('div', {
    style: {
      position: 'fixed',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--间距-4)',
      backgroundColor: 'var(--遮罩颜色)',
      boxSizing: 'border-box',
    },
  })
  let 面板 = 创建元素('div', {
    role: 'dialog',
    tabIndex: -1,
    style: {
      width: 'min(440px, 100%)',
      maxHeight: 'min(680px, calc(100vh - 32px))',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--间距-4)',
      padding: 'var(--间距-5)',
      backgroundColor: 'var(--卡片背景颜色)',
      color: 'var(--文字颜色)',
      border: '1px solid var(--边框颜色)',
      borderRadius: 'var(--圆角-大)',
      boxShadow: 'var(--深阴影)',
      boxSizing: 'border-box',
    },
  })
  面板.setAttribute('aria-modal', 'true')
  let 消息编号 = `lsby-dialog-message-${++对话框编号}`
  let 消息 = 创建元素('div', {
    id: 消息编号,
    textContent: 选项.消息,
    style: { fontSize: 'var(--字号-正文)', lineHeight: 'var(--行高-正文)', whiteSpace: 'pre-wrap' },
  })
  面板.setAttribute('aria-labelledby', 消息编号)
  面板.append(消息)
  if (选项.提示 !== undefined) {
    面板.append(
      创建元素('div', { textContent: 选项.提示, style: { color: 'var(--次要文字颜色)', fontSize: 'var(--字号-小)' } }),
    )
  }
  let 返回值: { 遮罩: HTMLDivElement; 面板: HTMLDivElement; 按钮容器: HTMLDivElement; 输入框?: 普通输入框 } = {
    遮罩,
    面板,
    按钮容器: 创建元素('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--间距-2)' } }),
  }
  if (选项.输入 !== undefined) {
    let 输入框 = new 普通输入框({ 值: 选项.输入.默认值 ?? '', 占位符: 选项.输入.占位符 ?? '请输入内容' })
    面板.append(输入框)
    返回值.输入框 = 输入框
  }
  面板.append(返回值.按钮容器)
  遮罩.append(面板)
  return 返回值
}

export function 显示对话框(消息: string): Promise<void> {
  return new Promise<void>((resolve) => {
    let { 遮罩, 面板, 按钮容器 } = 创建对话框框架({ 消息 })
    let 句柄: 浮层句柄 | null = null
    let 已结束 = false
    let 完成 = async (): Promise<void> => {
      if (已结束 === true) return
      已结束 = true
      await 句柄?.关闭()
      resolve()
    }
    按钮容器.append(new 主要按钮({ 文本: '确定', 自动加载: false, 点击处理函数: 完成 }))
    句柄 = 浮层管理器.打开({
      根元素: 遮罩,
      内容元素: 面板,
      模态: true,
      允许Escape关闭: true,
      外部关闭: '不关闭',
      请求关闭: 完成,
    })
  })
}

export function 显示确认对话框(消息: string, 提示?: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let 选项: 对话框选项 = { 消息 }
    if (提示 !== undefined) 选项.提示 = 提示
    let { 遮罩, 面板, 按钮容器 } = 创建对话框框架(选项)
    let 句柄: 浮层句柄 | null = null
    let 已结束 = false
    let 完成 = async (结果: boolean): Promise<void> => {
      if (已结束 === true) return
      已结束 = true
      await 句柄?.关闭()
      resolve(结果)
    }
    按钮容器.append(
      new 普通按钮({ 文本: '取消', 自动加载: false, 点击处理函数: async (): Promise<void> => await 完成(false) }),
      new 主要按钮({ 文本: '确定', 自动加载: false, 点击处理函数: async (): Promise<void> => await 完成(true) }),
    )
    句柄 = 浮层管理器.打开({
      根元素: 遮罩,
      内容元素: 面板,
      模态: true,
      允许Escape关闭: true,
      外部关闭: '不关闭',
      请求关闭: async (): Promise<void> => await 完成(false),
    })
  })
}

export function 显示输入对话框(消息: string, 默认值?: string, 提示?: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let 输入选项: { 默认值?: string; 占位符?: string } = {}
    if (默认值 !== undefined) 输入选项.默认值 = 默认值
    let 选项: 对话框选项 = { 消息, 输入: 输入选项 }
    if (提示 !== undefined) 选项.提示 = 提示
    let { 遮罩, 面板, 按钮容器, 输入框 } = 创建对话框框架(选项)
    if (输入框 === undefined) throw new Error('创建输入对话框失败')
    let 句柄: 浮层句柄 | null = null
    let 已结束 = false
    let 完成 = async (结果: string | null): Promise<void> => {
      if (已结束 === true) return
      已结束 = true
      await 句柄?.关闭()
      resolve(结果)
    }
    输入框.监听发出事件('回车', async (): Promise<void> => await 完成(输入框.获得值()))
    按钮容器.append(
      new 普通按钮({ 文本: '取消', 自动加载: false, 点击处理函数: async (): Promise<void> => await 完成(null) }),
      new 主要按钮({
        文本: '确定',
        自动加载: false,
        点击处理函数: async (): Promise<void> => await 完成(输入框.获得值()),
      }),
    )
    句柄 = 浮层管理器.打开({
      根元素: 遮罩,
      内容元素: 面板,
      模态: true,
      允许Escape关闭: true,
      外部关闭: '不关闭',
      初始焦点: 输入框,
      请求关闭: async (): Promise<void> => await 完成(null),
    })
  })
}
