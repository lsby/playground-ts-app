import { 显示输入对话框 } from '../../../global/manager/dialog-manager'
import { 创建元素 } from '../../../global/tools/create-element'
import { 文本按钮, 普通按钮 } from '../base/base-button'
import { 创建数据表单元格键, 数据表列配置, 数据表操作配置, 数据表行键, 顶部操作配置 } from './types'

export type 表格渲染上下文<数据项> = {
  列配置: 数据表列配置<数据项>[]
  数据列表: 数据项[]
  获得行键: (行索引: number) => 数据表行键 | undefined
  操作列表: 数据表操作配置<数据项>[]
  顶部操作列表: 顶部操作配置[]
  筛选条件: Record<string, string>
  排序列表: { field: keyof 数据项; direction: 'asc' | 'desc' }[]
  选中行键: ReadonlySet<数据表行键>
  最后单元格: { 行键: 数据表行键; 列: number } | null
  多选模式: boolean
  列最小宽度: string
  列最大宽度?: string
  表格行元素映射: Map<数据表行键, HTMLTableRowElement>
  表格单元格元素映射: Map<string, HTMLTableCellElement>
  表头元素映射: Map<number, HTMLElement>
  列单元格映射: Map<number, HTMLElement[]>
  加载数据: () => Promise<void>
  刷新数据: () => Promise<void>
  处理行点击: (行索引: number, ctrl键: boolean, shift键: boolean) => void
  处理单元格点击: (行索引: number, 列索引: number, ctrl键: boolean, shift键: boolean) => void
  更新选中状态: () => void
  显示右键菜单: (x: number, y: number) => void
  开始调整列宽: (列索引: number, event: MouseEvent, 表头: HTMLElement) => void
}

export function 渲染顶部操作区<数据项>(上下文: 表格渲染上下文<数据项>): HTMLElement | null {
  if (上下文.顶部操作列表.length === 0) return null
  let 操作区 = 创建元素('div', {
    style: { display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 'var(--间距-2)' },
  })
  for (let 操作 of 上下文.顶部操作列表) 操作区.append(new 普通按钮({ 文本: 操作.名称, 点击处理函数: 操作.回调 }))
  return 操作区
}

export function 渲染表头<数据项>(上下文: 表格渲染上下文<数据项>, 操作列宽度列表: number[]): HTMLTableSectionElement {
  let 表头 = 创建元素('thead')
  let 表头行 = 创建元素('tr')
  for (let 列索引 = 0; 列索引 < 上下文.列配置.length; 列索引 += 1) {
    let 列 = 上下文.列配置[列索引]
    if (列 === undefined) continue
    let 字段名 = String(列.字段名)
    let 列最大宽度 = 列.列最大宽度 ?? 上下文.列最大宽度
    let 有筛选 = 上下文.筛选条件[字段名] !== undefined
    let th = 创建元素('th', {
      scope: 'col',
      style: {
        position: 'relative',
        padding: 'var(--间距-2) var(--间距-3)',
        textAlign: 'left',
        borderBottom: '1px solid var(--边框颜色)',
        backgroundColor: 有筛选 ? 'var(--选中背景颜色)' : 'var(--面板背景颜色)',
        minWidth: 列.列最小宽度 ?? 上下文.列最小宽度,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...(列最大宽度 === undefined ? {} : { maxWidth: 列最大宽度, width: 列最大宽度 }),
      },
    })
    上下文.表头元素映射.set(列索引, th)
    let 内容 = 创建元素('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--间距-1)' } })
    let 排序索引 = 上下文.排序列表.findIndex((项) => 项.field === 列.字段名)
    let 排序项 = 上下文.排序列表[排序索引]
    let 排序标识 = 排序项 === undefined ? '' : ` ${排序项.direction === 'asc' ? '▲' : '▼'}${排序索引}`
    let 标签 = new 文本按钮({
      文本: `${列.显示名}${排序标识}`,
      禁用: 列.可排序 !== true,
      自动加载: false,
      元素样式: { padding: '0', color: 'var(--文字颜色)', textDecoration: 'none' },
      点击处理函数: async (): Promise<void> => await 切换排序(上下文, 列),
    })
    内容.append(标签)
    if (列.可筛选 === true) {
      内容.append(
        new 文本按钮({
          文本: 有筛选 ? '修改筛选' : '筛选',
          尺寸: '紧凑',
          自动加载: false,
          点击处理函数: async (): Promise<void> => await 设置筛选(上下文, 字段名),
        }),
      )
    }
    th.append(内容)
    let 调整柄 = 创建元素('div', {
      role: 'separator',
      title: '调整列宽',
      style: { position: 'absolute', right: '0', top: '0', bottom: '0', width: '6px', cursor: 'col-resize' },
      onmousedown: (event: MouseEvent): void => 上下文.开始调整列宽(列索引, event, th),
    })
    th.append(调整柄)
    表头行.append(th)
  }
  for (let 索引 = 0; 索引 < 上下文.操作列表.length; 索引 += 1) {
    let 操作 = 上下文.操作列表[索引]
    if (操作 !== undefined)
      表头行.append(
        创建元素('th', {
          scope: 'col',
          textContent: 操作.名称,
          style: {
            padding: 'var(--间距-2)',
            textAlign: 'center',
            borderBottom: '1px solid var(--边框颜色)',
            backgroundColor: 'var(--面板背景颜色)',
            width: `${操作列宽度列表[索引] ?? 88}px`,
          },
        }),
      )
  }
  表头.append(表头行)
  return 表头
}

export function 渲染表体<数据项>(上下文: 表格渲染上下文<数据项>, 操作列宽度列表: number[]): HTMLTableSectionElement {
  let 表体 = 创建元素('tbody')
  if (上下文.数据列表.length === 0) {
    表体.append(创建空行(上下文.列配置.length + 上下文.操作列表.length, '暂无数据'))
    return 表体
  }
  for (let 行索引 = 0; 行索引 < 上下文.数据列表.length; 行索引 += 1) {
    let 数据项 = 上下文.数据列表[行索引]
    let 行键 = 上下文.获得行键(行索引)
    if (数据项 === undefined || 数据项 === null || 行键 === undefined) continue
    let 行 = 创建元素('tr', {
      tabIndex: 0,
      style: {
        cursor: 'pointer',
        backgroundColor: 上下文.选中行键.has(行键) ? 'var(--选中背景颜色)' : '',
        transition: 'background-color var(--动画-快)',
      },
    })
    行.setAttribute('aria-selected', 上下文.选中行键.has(行键) ? 'true' : 'false')
    行.dataset['rowKey'] = String(行键)
    行.onclick = (event: MouseEvent): void => {
      上下文.处理行点击(行索引, event.ctrlKey, event.shiftKey)
      上下文.更新选中状态()
    }
    行.onkeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        上下文.处理行点击(行索引, event.ctrlKey, event.shiftKey)
        上下文.更新选中状态()
      }
    }
    行.oncontextmenu = (event: MouseEvent): void => {
      event.preventDefault()
      if (上下文.选中行键.has(行键) === false) 上下文.处理行点击(行索引, false, false)
      上下文.更新选中状态()
      上下文.显示右键菜单(event.clientX, event.clientY)
    }
    上下文.表格行元素映射.set(行键, 行)
    for (let 列索引 = 0; 列索引 < 上下文.列配置.length; 列索引 += 1) {
      let 列 = 上下文.列配置[列索引]
      if (列 === undefined) continue
      let 值 = 数据项[列.字段名]
      let 列最大宽度 = 列.列最大宽度 ?? 上下文.列最大宽度
      let 强调 = 上下文.最后单元格?.行键 === 行键 && 上下文.最后单元格.列 === 列索引 && 上下文.多选模式 === false
      let td = 创建元素('td', {
        style: {
          padding: 'var(--间距-2) var(--间距-3)',
          borderBottom: '1px solid var(--边框颜色)',
          backgroundColor: 强调 ? 'var(--强调背景颜色)' : '',
          minWidth: 列.列最小宽度 ?? 上下文.列最小宽度,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          ...(列最大宽度 === undefined ? {} : { maxWidth: 列最大宽度, width: 列最大宽度 }),
        },
      })
      td.onclick = (event: MouseEvent): void => {
        event.stopPropagation()
        上下文.处理单元格点击(行索引, 列索引, event.ctrlKey, event.shiftKey)
        上下文.更新选中状态()
      }
      td.oncontextmenu = (event: MouseEvent): void => {
        event.preventDefault()
        event.stopPropagation()
        上下文.处理单元格点击(行索引, 列索引, false, false)
        上下文.更新选中状态()
        上下文.显示右键菜单(event.clientX, event.clientY)
      }
      let 渲染结果 = 列.渲染函数?.(值, 数据项)
      if (typeof 渲染结果 === 'string') td.textContent = 渲染结果
      else if (渲染结果 instanceof Node) td.append(渲染结果)
      else td.textContent = 列.格式化?.(值) ?? (值 === null || 值 === undefined ? 'NULL' : String(值))
      td.title = td.textContent
      let 单元格键 = 创建数据表单元格键(行键, 列索引)
      上下文.表格单元格元素映射.set(单元格键, td)
      let 列单元格们 = 上下文.列单元格映射.get(列索引) ?? []
      列单元格们.push(td)
      上下文.列单元格映射.set(列索引, 列单元格们)
      行.append(td)
    }
    for (let 索引 = 0; 索引 < 上下文.操作列表.length; 索引 += 1) {
      let 操作 = 上下文.操作列表[索引]
      if (操作 === undefined) continue
      let 单元格 = 创建元素('td', {
        style: {
          padding: 'var(--间距-2)',
          textAlign: 'center',
          borderBottom: '1px solid var(--边框颜色)',
          width: `${操作列宽度列表[索引] ?? 88}px`,
        },
      })
      单元格.append(
        new 普通按钮({
          文本: 操作.名称,
          尺寸: '紧凑',
          点击处理函数: async (event): Promise<void> => {
            event.stopPropagation()
            await 操作.回调(数据项)
            await 上下文.刷新数据()
          },
        }),
      )
      行.append(单元格)
    }
    表体.append(行)
  }
  return 表体
}

function 创建空行(列数: number, 文本: string): HTMLTableRowElement {
  let 行 = 创建元素('tr')
  行.append(
    创建元素('td', {
      colSpan: Math.max(1, 列数),
      textContent: 文本,
      style: { padding: 'var(--间距-6)', textAlign: 'center', color: 'var(--次要文字颜色)' },
    }),
  )
  return 行
}

async function 切换排序<数据项>(上下文: 表格渲染上下文<数据项>, 列: 数据表列配置<数据项>): Promise<void> {
  if (列.可排序 !== true) return
  let 索引 = 上下文.排序列表.findIndex((项) => 项.field === 列.字段名)
  let 当前 = 上下文.排序列表[索引]
  if (索引 < 0) 上下文.排序列表.push({ field: 列.字段名, direction: 'asc' })
  else if (当前?.direction === 'asc') 当前.direction = 'desc'
  else 上下文.排序列表.splice(索引, 1)
  await 上下文.加载数据()
}

async function 设置筛选<数据项>(上下文: 表格渲染上下文<数据项>, 字段名: string): Promise<void> {
  let 结果 = await 显示输入对话框('输入筛选条件', 上下文.筛选条件[字段名] ?? '')
  if (结果 === null) return
  if (结果 === '') delete 上下文.筛选条件[字段名]
  else 上下文.筛选条件[字段名] = 结果
  await 上下文.加载数据()
}
