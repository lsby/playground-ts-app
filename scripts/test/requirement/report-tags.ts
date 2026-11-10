import { 转义Html } from './report-evidence'
import type { 标签来源, 标签过滤 } from './tag-filter'

export let 标签样式 = `
.show-excluded{display:inline-flex;align-items:center;gap:4px;font-size:12px}
.nav:has([data-show-excluded]:not(:checked)) [data-excluded]{display:none}
.nav:has([data-show-excluded]:not(:checked)) [data-requirement-folder]:has(.requirement-group):not(:has(.requirement-group:not([data-excluded]))){display:none}
.report-tags,.report-tag-filters{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;font-size:12px;min-width:0}
.report-overview .report-tags{margin:4px 0 8px}
.report-tag{min-width:0;overflow-wrap:anywhere;border-radius:5px;padding:2px 6px;background:light-dark(#eaf0ed,#2b3c33);color:light-dark(#2f5142,#c7e3d4)}
.excluded,.tag-exclusion{background:light-dark(#f8ebd5,#473825);color:light-dark(#775017,#f5d49d)}
.tag-exclusion{margin:14px 25px;padding:10px 12px;border-radius:6px;overflow-wrap:anywhere}
`

export function 生成标签Html(标题: string, 标签们: readonly string[]): string {
  let 标签列表 = 标签们.map((标签) => `<span class="report-tag">${转义Html(标签)}</span>`).join('')
  return `<div class="report-tags"><span>${标题}</span>${标签列表 === '' ? '<span>未设置</span>' : 标签列表}</div>`
}

export function 生成详情标签Html(标签们: readonly string[]): string {
  return 标签们.length === 0 ? '' : 生成标签Html('标签', 标签们)
}

export function 生成报告标签过滤Html(过滤: 标签过滤 | undefined): string {
  return `<div class="report-tag-filters">${生成标签Html('本次排除标签', 过滤?.模式 === '排除' ? 过滤.标签们 : [])}
    ${生成标签Html('本次包括标签', 过滤?.模式 === '包括' ? 过滤.标签们 : [])}</div>`
}

export function 生成排除原因Html(原因: readonly 标签来源[] | undefined): string {
  if (原因 === undefined) return ''
  let 说明 =
    原因.length === 0
      ? '需求、验收点和流程均未命中本次包括标签。'
      : 原因.map(({ 层级, 名称, 标签们 }) => `${层级}「${名称}」命中排除标签「${标签们.join('、')}」`).join('。') + '。'
  return `<p class="tag-exclusion">${转义Html(说明)}</p>`
}
