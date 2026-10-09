import { API管理器 } from '../../global/manager/api-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 主要按钮, 危险按钮, 普通按钮 } from './base/base-button'

type 恢复入口配置 = {
  错误: unknown
  重试: () => Promise<void>
  恢复成功: () => void | Promise<void>
  重建本地数据后?: (用户id: string) => void | Promise<void>
}

function 获得错误详情(错误: unknown): string {
  if (错误 instanceof Error) return `${错误.name}: ${错误.message}`
  return String(错误)
}

export function 创建本地优先恢复入口(配置: 恢复入口配置): HTMLElement {
  let 原因 = 创建元素('pre', {
    textContent: 获得错误详情(配置.错误),
    style: {
      maxHeight: '22vh',
      overflow: 'auto',
      padding: 'var(--间距-3)',
      border: '1px solid var(--边框颜色)',
      borderRadius: 'var(--圆角-中)',
      color: 'var(--文字颜色)',
      fontSize: 'var(--字号-小)',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
    },
  })
  let 状态 = 创建元素('p', {
    role: 'status',
    style: { color: 'var(--次要文字颜色)', margin: '0', minHeight: '1.5em', textAlign: 'center' },
  })
  let 正在操作 = false
  let 确认区 = 创建元素('div', {
    style: {
      display: 'none',
      gap: 'var(--间距-3)',
      padding: 'var(--间距-3)',
      border: '1px solid var(--错误前景)',
      borderRadius: 'var(--圆角-中)',
    },
  })
  let 执行尝试修复 = async (): Promise<void> => {
    if (正在操作 === true) return
    正在操作 = true
    状态.textContent = '正在修复，请稍候…'
    try {
      await 配置.重试()
      await 配置.恢复成功()
    } catch (错误) {
      状态.textContent = '本机数据仍无法恢复。继续前请确认是否改用云端数据。'
      原因.textContent = 获得错误详情(错误)
      确认区.style.display = 'grid'
    } finally {
      正在操作 = false
    }
  }
  let 执行重建 = async (): Promise<void> => {
    if (正在操作 === true) return
    正在操作 = true
    确认区.style.display = 'none'
    状态.textContent = '正在下载云端数据，请稍候…'
    try {
      let 用户id = await API管理器.强制从远程重建本地优先数据()
      await 配置.重建本地数据后?.(用户id)
      await 配置.恢复成功()
    } catch (错误) {
      状态.textContent = '暂时无法下载云端数据，请检查网络后重试。'
      原因.textContent = 获得错误详情(错误)
      确认区.style.display = 'grid'
    } finally {
      正在操作 = false
    }
  }
  let 修复按钮 = new 主要按钮({ 文本: '修复并继续', 点击处理函数: async (): Promise<void> => await 执行尝试修复() })
  确认区.append(
    创建元素('p', {
      textContent: '本机数据无法继续使用。改用云端数据后，尚未上传的本机修改会丢失。是否继续？',
      style: { lineHeight: '1.7', margin: '0' },
    }),
    创建元素('div', {
      style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--间距-3)', justifyContent: 'flex-end' },
      children: [
        new 普通按钮({
          文本: '暂不处理',
          点击处理函数: (): void => {
            确认区.style.display = 'none'
            状态.textContent = '尚未改用云端数据，可以稍后重新尝试。'
          },
        }),
        new 危险按钮({ 文本: '使用云端数据继续', 点击处理函数: async (): Promise<void> => await 执行重建() }),
      ],
    }),
  )
  let 错误详情 = 创建元素('details', {
    style: { color: 'var(--次要文字颜色)', fontSize: 'var(--字号-小)' },
    children: [创建元素('summary', { textContent: '查看错误详情', style: { cursor: 'pointer' } }), 原因],
  })
  let 面板 = 创建元素('section', {
    role: 'alertdialog',
    ariaLabel: '修复本机数据',
    style: {
      width: 'min(520px, 100%)',
      maxHeight: 'calc(100dvh - 32px)',
      overflow: 'auto',
      boxSizing: 'border-box',
      display: 'grid',
      gap: 'var(--间距-4)',
      padding: 'var(--间距-6)',
      borderRadius: 'var(--圆角-大)',
      backgroundColor: 'var(--卡片背景颜色)',
      color: 'var(--文字颜色)',
      boxShadow: 'var(--深阴影)',
    },
    children: [
      创建元素('h1', { textContent: '本机数据需要修复', style: { margin: '0', fontSize: 'var(--字号-标题)' } }),
      创建元素('p', {
        textContent:
          '应用更新后，本机数据暂时无法正常读取。点击后会先尽力保留本机修改；如果仍无法恢复，应用会在重新下载云端数据前再次征求你的确认。',
        style: { color: 'var(--次要文字颜色)', lineHeight: '1.7', margin: '0' },
      }),
      创建元素('div', { style: { display: 'flex', justifyContent: 'center' }, children: [修复按钮] }),
      状态,
      确认区,
      错误详情,
    ],
  })
  return 创建元素('div', {
    style: {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      display: 'grid',
      placeItems: 'center',
      padding: 'var(--间距-4)',
      boxSizing: 'border-box',
      backgroundColor: 'var(--遮罩颜色)',
    },
    children: [面板],
  })
}
