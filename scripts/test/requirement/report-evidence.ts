import type { 流程建议, 流程步骤附件, 运行步骤描述 } from '../../../src/model/test-requirement'

export function 转义Html(值: string): string {
  return 值
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function 生成切图控件(位置: string): string {
  return `<div class="gallery-controls" data-gallery-controls>
    <button type="button" data-prev aria-label="上一张" aria-disabled="true">‹</button>
    <span data-index aria-live="polite">${位置}</span>
    <button type="button" data-next aria-label="下一张">›</button>
  </div>`
}

function 生成步骤附件Html(
  附件组们: readonly (readonly 流程步骤附件[])[],
  页内建议: ReadonlyMap<number, string[]>,
): string {
  if (附件组们.length === 0) return ''
  let 控件 = 附件组们.length === 1 ? '' : 生成切图控件(`1 / ${String(附件组们.length)}`)
  let 图片序号 = 0
  let 页面们 = 附件组们
    .map((附件们, 页索引) => {
      let 内容 = 附件们
        .map((附件) => {
          switch (附件.类型) {
            case '文本':
              return 附件.日志流 === undefined
                ? `<p>${转义Html(附件.内容)}</p>`
                : `<div class="step-log"><p class="step-log-title">后端日志（${附件.日志流}）</p>
                  <div class="step-log-content" role="region" aria-label="后端日志（${附件.日志流}）" tabindex="0"><p>${转义Html(附件.内容)}</p></div></div>`
            case '图片': {
              图片序号 += 1
              let 说明 = 转义Html(附件.说明 ?? `步骤图片 ${String(图片序号)}`)
              return `<figure class="gallery-frame">
        <button type="button" class="step-image" data-zoom aria-haspopup="dialog" aria-label="查看大图">
          <img src="data:${转义Html(附件.内容类型)};base64,${转义Html(附件.内容)}" alt="${说明}" loading="lazy">
        </button><figcaption>${说明}</figcaption></figure>`
            }
          }
        })
        .join('')
      return `<div class="gallery-page" data-frame${页索引 === 0 ? '' : ' hidden'}>${内容}${页内建议.get(页索引)?.join('') ?? ''}</div>`
    })
    .join('')
  return `<div class="step-attachments" data-gallery>${控件}${页面们}</div>`
}

function 生成建议卡片({ 标题, 现象, 影响, 改进方向, 操作编号 }: 流程建议, 索引: number): string {
  let 来源 = 操作编号 === undefined ? '' : `<span class="muted">录制操作 #${String(操作编号)}</span>`
  return `<article class="step-suggestion" data-suggestion-card="${String(索引)}" tabindex="-1">
    <h5>${转义Html(标题)} <span class="badge neutral">探索时记录</span> ${来源}</h5>
    <p class="flow-text"><strong>现象</strong> ${转义Html(现象)}</p>
    <p class="flow-text"><strong>影响</strong> ${转义Html(影响)}</p>
    ${改进方向 === undefined ? '' : `<p class="flow-text"><strong>改进方向</strong> ${转义Html(改进方向)}</p>`}</article>`
}

export function 生成步骤证据Html(步骤: 运行步骤描述): string {
  let 位置 = 步骤.状态 === '未执行' ? undefined : 步骤.操作附件位置们
  let 步骤建议: string[] = []
  let 页内建议 = new Map<number, string[]>()
  for (let [索引, 建议] of 步骤.建议们.entries()) {
    let 卡片 = 生成建议卡片(建议, 索引)
    let 页索引 = 位置?.find(({ 操作编号 }) => 操作编号 === 建议.操作编号)?.附件组索引
    if (页索引 === undefined) {
      步骤建议.push(卡片)
      continue
    }
    let 卡片们 = 页内建议.get(页索引) ?? []
    卡片们.push(卡片)
    页内建议.set(页索引, 卡片们)
  }
  let 附件 = 步骤.状态 === '未执行' ? '' : 生成步骤附件Html(步骤.附件组们, 页内建议)
  return 步骤建议.join('') + 附件
}
