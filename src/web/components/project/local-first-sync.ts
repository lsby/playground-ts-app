import { API管理器, 本地优先同步解决方案, 本地优先同步问题 } from '../../global/manager/api-manager'
import { 显示对话框 } from '../../global/manager/dialog-manager'

export type 本地优先同步触发时机 = '登录' | '恢复登录' | '退出登录'

async function 解决本地优先同步问题(问题: 本地优先同步问题): Promise<本地优先同步解决方案> {
  switch (问题.type) {
    case 'migration-failed':
      await 显示对话框('本机数据库升级失败，本地未同步数据将丢失。程序将丢弃本机数据并从服务器重新同步。')
      return { action: 'discard-and-reinitialize' }
    case 'data-conflict':
      return { action: 'abort' }
    case 'constraint-violation':
      return { action: 'abort' }
  }
}

async function 处理本地优先同步失败(错误: unknown): Promise<void> {
  let 详情 = 错误 instanceof Error ? 错误.message : String(错误)
  await 显示对话框(`本地优先同步失败：${详情}`)
}

export async function 同步项目本地优先数据(): Promise<void> {
  if (API管理器.已设置token() === false) return
  await API管理器.本地优先同步(解决本地优先同步问题, 处理本地优先同步失败)
}

export async function 尝试同步项目本地优先数据(触发时机: 本地优先同步触发时机): Promise<void> {
  try {
    await 同步项目本地优先数据()
  } catch (错误) {
    console.error(`${触发时机}时本地优先同步失败: %o`, { 类型: 错误 instanceof Error ? 错误.name : typeof 错误 })
  }
}
