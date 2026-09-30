import { API管理器 } from '../../global/manager/api-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 主要按钮, 危险按钮, 普通按钮 } from './base/base-button'

type 恢复入口配置 = {
  错误: unknown
  重试: () => Promise<void>
  恢复成功: () => void | Promise<void>
  放弃本地数据后?: (用户id: string) => void | Promise<void>
}

function 获得错误详情(错误: unknown): string {
  if (错误 instanceof Error) return `${错误.name}: ${错误.message}`
  return String(错误)
}

export function 创建本地优先恢复入口(配置: 恢复入口配置): HTMLElement {
  let 原因 = 创建元素('pre', {
    textContent: 获得错误详情(配置.错误),
    style: {
      maxHeight: '30vh',
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
  let 状态 = 创建元素('p', { role: 'status', style: { color: 'var(--错误前景)', whiteSpace: 'pre-wrap' } })
  let 正在操作 = false
  let 执行 = async (操作: () => Promise<void>): Promise<void> => {
    if (正在操作 === true) return
    正在操作 = true
    状态.textContent = '正在恢复本地数据…'
    try {
      await 操作()
      await 配置.恢复成功()
    } catch (错误) {
      状态.textContent = '恢复失败，请查看下方原因后重试。'
      原因.textContent = 获得错误详情(错误)
    } finally {
      正在操作 = false
    }
  }
  let 重试按钮 = new 主要按钮({ 文本: '重试同步', 点击处理函数: async (): Promise<void> => await 执行(配置.重试) })
  let 确认区 = 创建元素('div', {
    style: { display: 'none', gap: 'var(--间距-3)', padding: 'var(--间距-3)', border: '1px solid var(--错误前景)' },
  })
  let 重建按钮 = new 危险按钮({
    文本: '放弃本地数据并从远程重建',
    点击处理函数: (): void => {
      确认区.style.display = 'grid'
    },
  })
  确认区.append(
    创建元素('p', {
      textContent:
        配置.放弃本地数据后 === undefined
          ? '确认删除当前账号的本地优先数据库吗？尚未同步到服务器的修改会永久丢失。'
          : '确认删除当前账号的本地数据库和业务缓存吗？尚未同步的修改、草稿和待提交数据会永久丢失。',
    }),
    创建元素('div', {
      style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--间距-3)' },
      children: [
        new 普通按钮({
          文本: '取消',
          点击处理函数: (): void => {
            确认区.style.display = 'none'
          },
        }),
        new 危险按钮({
          文本: '确认放弃并重建',
          点击处理函数: async (): Promise<void> =>
            await 执行(async (): Promise<void> => {
              let 用户id = await API管理器.强制从远程重建本地优先数据()
              await 配置.放弃本地数据后?.(用户id)
            }),
        }),
      ],
    }),
  )
  let 按钮区 = 创建元素('div', {
    style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--间距-3)', justifyContent: 'center' },
    children: [重试按钮, 重建按钮],
  })
  let 面板 = 创建元素('section', {
    role: 'alertdialog',
    ariaLabel: '本地优先数据控制台',
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
      创建元素('h1', { textContent: '本地优先数据控制台', style: { margin: '0', fontSize: 'var(--字号-标题)' } }),
      创建元素('p', {
        textContent: '以下是同步失败的实际原因。可以重试；也可以放弃当前账号的本地数据，从服务器重新建立。',
      }),
      原因,
      状态,
      按钮区,
      确认区,
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
