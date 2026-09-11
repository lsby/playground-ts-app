import { 组件基类 } from '../../../base/base'

export type 标签页路由项 = { 标识?: string | undefined }
export type 标签方向 = 'horizontal' | 'vertical'

let 标签页序号 = 0

export function 创建标签页标识前缀(): string {
  标签页序号 += 1
  return `lsby-tabs-${标签页序号}`
}

export function 读取标签页索引(路由键: string | undefined, 标签页列表: 标签页路由项[], 当前索引: number): number {
  if (typeof 路由键 !== 'string') return 当前索引
  let 标识字符串 = new URLSearchParams(window.location.search).get(路由键)
  if (标识字符串 === null) return 当前索引
  let 索引 = 标签页列表.findIndex((项): boolean => 项.标识 === 标识字符串)
  if (索引 === -1) {
    let 解析索引 = Number.parseInt(标识字符串, 10)
    if (Number.isNaN(解析索引) === false) 索引 = 解析索引
  }
  return 索引 >= 0 && 索引 < 标签页列表.length ? 索引 : 当前索引
}

export function 同步标签页路由(路由键: string | undefined, 项: 标签页路由项 | undefined, 索引: number): void {
  if (typeof 路由键 !== 'string') return
  let 参数 = new URLSearchParams(window.location.search)
  参数.set(路由键, 项?.标识 ?? 索引.toString())
  let 查询字符串 = 参数.toString()
  let 新地址 = `${window.location.pathname}${查询字符串 === '' ? '' : `?${查询字符串}`}${window.location.hash}`
  window.history.replaceState(null, '', 新地址)
}

export function 计算键盘目标索引(
  事件: KeyboardEvent,
  当前索引: number,
  标签数量: number,
  方向: 标签方向,
): number | null {
  if (标签数量 === 0) return null
  if (事件.key === 'Home') return 0
  if (事件.key === 'End') return 标签数量 - 1
  let 后退键 = 方向 === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
  let 前进键 = 方向 === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
  if (事件.key === 后退键) return (当前索引 - 1 + 标签数量) % 标签数量
  if (事件.key === 前进键) return (当前索引 + 1) % 标签数量
  return null
}

export async function 刷新标签页内容(内容: HTMLElement): Promise<void> {
  if (内容 instanceof 组件基类) {
    await 内容.刷新()
    return
  }
  for (let 子元素 of Array.from(内容.children)) {
    if (子元素 instanceof HTMLElement) await 刷新标签页内容(子元素)
  }
}
