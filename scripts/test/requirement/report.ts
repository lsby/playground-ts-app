import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { 浏览器测试模式 } from '../../../src/model/browser-test'
import {
  行为,
  type 流程步骤附件,
  type 流程运行错误,
  type 需求,
  type 需求测试流程,
  type 需求测试结果,
  type 需求测试附件,
  type 验收点,
} from '../../../src/model/test-requirement'
import { 交互脚本, 样式 } from './report-assets'

type 需求测试登记 = { 流程: 需求测试流程; 需求们: readonly 需求[]; 文件: string }
export type 需求测试附件记录 = Omit<需求测试附件, '路径'> & { 相对路径: string }
export type 需求测试尝试记录 = {
  尝试序号: number
  结果: 需求测试结果
  附件们: readonly 需求测试附件记录[]
  附件错误们: readonly 流程运行错误[]
  清理错误们: readonly 流程运行错误[]
}
type 需求测试记录 = { 测试: 需求测试登记; 尝试们: readonly 需求测试尝试记录[] }

type 报告参数 = {
  模式: 浏览器测试模式
  服务地址: string | undefined
  开始时间: number
  结束时间: number
  需求们: readonly 需求[]
  流程们: readonly 需求测试登记[]
  选中流程们: readonly 需求测试登记[]
  记录们: readonly 需求测试记录[]
  基础设施错误们: readonly string[]
  覆盖错误们: readonly string[]
  中断码: number | undefined
}
type 验收状态 = '已证明' | '未证明' | '未实现' | '未执行'
type 目录流程 = { id: string; 测试: 需求测试登记; 状态: 需求测试结果['状态'] | '未执行' }
type 验收目录项 = { id: string; 点: 验收点; 状态: 验收状态; 关联流程们: readonly 目录流程[] }
type 步骤记录 = 需求测试结果['步骤们'][number]
type 标记样式 = 'ok' | 'interrupted' | 'unimplemented' | 'neutral' | 'fail'
type 报告摘要 = { 通过数: number; 失败数: number; 中断数: number; 未执行数: number }
let 流程状态样式: Record<需求测试结果['状态'] | '未执行', 标记样式> = {
  通过: 'ok',
  失败: 'fail',
  中断: 'interrupted',
  未执行: 'neutral',
}
let 验收状态优先级: readonly 验收状态[] = ['未证明', '未实现', '未执行', '已证明']

function 转义Html(值: string): string {
  return 值
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function 状态标记(文字: string, 样式: 标记样式): string {
  return `<span class="badge ${样式}">${转义Html(文字)}</span>`
}

function 验收状态样式(状态: 验收状态): 标记样式 {
  switch (状态) {
    case '已证明':
      return 'ok'
    case '未证明':
      return 'fail'
    case '未实现':
      return 'unimplemented'
    case '未执行':
      return 'neutral'
  }
}

function 目录状态标记(状态: 验收状态 | 需求测试结果['状态'], 样式: 标记样式): string {
  return `<span class="directory-status ${样式}" role="img" aria-label="${状态}" title="${状态}"></span>`
}

function 生成关联流程链接(条目: 验收目录项, 目录中: boolean): string {
  return 条目.关联流程们
    .map(({ id, 测试, 状态 }) => {
      let 名称 = 转义Html(测试.流程.获得名称())
      let 样式 = 流程状态样式[状态]
      let 色点 = 目录中 ? 目录状态标记(状态, 样式) : ''
      let 标记 = 目录中 ? '' : 状态标记(状态, 样式)
      return `<li><a class="${目录中 ? 'flow-link' : 'report-link'}" href="#${条目.id}/${id}" data-acceptance="${条目.id}" data-flow-target="${id}" title="${名称}"><span class="flow-name">${名称}</span>${色点}</a>${标记}</li>`
    })
    .join('')
}

function 格式化耗时(耗时毫秒: number): string {
  return 耗时毫秒 < 1000 ? `${String(耗时毫秒)} ms` : `${(耗时毫秒 / 1000).toFixed(2)} s`
}

function 生成错误Html(错误: 流程运行错误): string {
  let 位置 = 错误.位置 === undefined ? '' : `<div>位置 ${String(错误.位置.行)}:${String(错误.位置.列)}</div>`
  let 预期值 = 错误.预期值 === undefined ? '' : `<div>预期 <code>${转义Html(错误.预期值)}</code></div>`
  let 实际值 = 错误.实际值 === undefined ? '' : `<div>实际 <code>${转义Html(错误.实际值)}</code></div>`
  return `<div class="problem">${位置}${预期值}${实际值}<pre>${转义Html(错误.文本)}</pre></div>`
}

function 生成切图控件(位置: string): string {
  return `<div class="gallery-controls" data-gallery-controls>
    <button type="button" data-prev aria-label="上一张" aria-disabled="true">‹</button>
    <span data-index aria-live="polite">${位置}</span>
    <button type="button" data-next aria-label="下一张">›</button>
  </div>`
}

function 生成步骤附件Html(附件组们: readonly (readonly 流程步骤附件[])[]): string {
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
                : `<details class="step-log"><summary>后端日志（${附件.日志流}）</summary><p>${转义Html(附件.内容)}</p></details>`
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
      return `<div class="gallery-page" data-frame${页索引 === 0 ? '' : ' hidden'}>${内容}</div>`
    })
    .join('')
  return `<div class="step-attachments" data-gallery>${控件}${页面们}</div>`
}

function 生成步骤Html(id: string, 步骤们: readonly 步骤记录[]): string {
  if (步骤们.length === 0) return ''
  let 目录: string[] = []
  let 详情: string[] = []
  for (let [序号, 步骤] of 步骤们.entries()) {
    let 观察 = 步骤.类型 === '观察'
    let 状态 = 步骤.状态 === '通过' && 观察 === false ? '已执行' : 步骤.状态
    let 样式 = 步骤.状态 === '失败' ? ' fail' : 步骤.状态 === '中断' ? ' interrupted' : ''
    let 耗时 = 步骤.状态 === '未执行' ? '' : ` · ${格式化耗时(步骤.耗时毫秒)}`
    let 错误 = 步骤.状态 === '未执行' || 步骤.错误 === undefined ? '' : 生成错误Html(步骤.错误)
    let 取证错误们 =
      步骤.状态 === '未执行' || 步骤.取证错误们.length === 0
        ? ''
        : `<details class="problems"><summary>取证错误</summary>${步骤.取证错误们.map(生成错误Html).join('')}</details>`
    let 步骤id = `${id}-step-${String(序号 + 1)}`
    let 名称 = 转义Html(步骤.名称)
    目录.push(`<li class="step">
        <button type="button" data-step-select aria-controls="${步骤id}"${序号 === 0 ? ' aria-current="step"' : ''}>
          <span class="num">${String(序号 + 1).padStart(2, '0')}</span>
          <span><span class="type">${步骤.类型}</span><strong>${名称}</strong></span>
        </button></li>`)
    详情.push(`<section id="${步骤id}" data-step-panel${序号 === 0 ? '' : ' hidden'}>
        <div class="stepmeta"><h4>${名称}</h4><span class="timing${样式}">${状态}${耗时}</span></div>
        ${步骤.状态 === '未执行' ? '' : 生成步骤附件Html(步骤.附件组们)}${错误}${取证错误们}</section>`)
  }
  return `<div class="step-workspace" data-step-workspace>
    <ol class="timeline" aria-label="流程步骤">${目录.join('')}</ol>
    <div class="step-evidence">
      <div class="step-panels" data-step-panels>${详情.join('')}</div>
      <div class="step-pagination">
        <button type="button" data-step-prev aria-disabled="true">上一步</button>
        <span data-step-position aria-live="polite">1 / ${String(步骤们.length)}</span>
        <button type="button" data-step-next aria-disabled="${String(步骤们.length === 1)}">下一步</button>
      </div>
    </div>
  </div>`
}

function 生成流程附件Html(附件们: readonly 需求测试附件记录[]): string {
  if (附件们.length === 0) return ''
  let 列表 = 附件们
    .map((项) => {
      let 地址 = 转义Html(项.相对路径.split('/').map(encodeURIComponent).join('/'))
      let 名称 = 转义Html(项.名称)
      if (项.内容类型?.startsWith('image/') === true) {
        return `<li><a href="${地址}" target="_blank" rel="noopener">${名称}
          <img class="attachment-preview" src="${地址}" alt="${名称}" loading="lazy"></a></li>`
      }
      let 下载 = 项.内容类型 === 'application/zip' ? ' download' : ''
      return `<li><a href="${地址}"${下载}>${名称}</a></li>`
    })
    .join('')
  return `<details class="attachments"><summary>流程附件 · ${String(附件们.length)} 项</summary><ul>${列表}</ul></details>`
}

function 归纳执行结论(尝试们: readonly 需求测试尝试记录[]): {
  状态: 需求测试结果['状态'] | '未执行'
  尝试次数: number
  已证明验收点名称们: string[]
  已证明验收点描述们: string[]
  未完成步骤: string | undefined
  原因: string | undefined
} {
  let 最后尝试 = 尝试们.at(-1)
  let 结果 = 最后尝试?.结果
  let 错误 = 结果?.错误 ?? 最后尝试?.清理错误们[0]
  let 消息 = 错误?.消息?.trim()
  let 原因 = (消息 === undefined || 消息 === '' ? 错误?.文本.trim() : 消息)?.split(/\r?\n/u)[0]
  if (错误?.预期值 !== undefined && 错误.实际值 !== undefined) 原因 = `预期 ${错误.预期值}，实际 ${错误.实际值}`
  return {
    状态: 结果?.状态 ?? '未执行',
    尝试次数: 尝试们.length,
    已证明验收点名称们: 结果?.证明验收点们.map((点) => 点.获得名称()) ?? [],
    已证明验收点描述们: 结果?.证明验收点们.map((点) => 点.获得描述()) ?? [],
    未完成步骤: 结果?.步骤们.find(({ 状态 }) => 状态 === '失败' || 状态 === '中断')?.名称,
    原因,
  }
}

function 生成执行结论Html(id: string, 结论: ReturnType<typeof 归纳执行结论>, 补充: string | undefined): string {
  let 标记 = 结论.尝试次数 > 1 ? `${结论.状态} · ${String(结论.尝试次数)} 次尝试` : 结论.状态
  let 已证明 = 结论.已证明验收点名称们.map((名称) => `<li>${转义Html(名称)}</li>`).join('')
  return `<section class="flow-conclusion" aria-labelledby="${id}-conclusion">
    <div class="headline"><h4 id="${id}-conclusion">执行结论</h4>${状态标记(标记, 流程状态样式[结论.状态])}</div>
    ${已证明 === '' ? '' : `<p>已证明的验收点</p><ul>${已证明}</ul>`}
    ${结论.未完成步骤 === undefined ? '' : `<p><strong>未完成步骤：</strong>${转义Html(结论.未完成步骤)}</p>`}
    ${结论.原因 === undefined || 结论.原因 === '' ? '' : `<p class="flow-text"><strong>原因：</strong>${转义Html(结论.原因)}</p>`}
    ${补充 === undefined ? '' : `<h5>补充说明</h5><p class="flow-text">${转义Html(补充)}</p>`}
    </section>`
}

function 生成流程Html(id: string, { 流程, 文件 }: 需求测试登记, 尝试们: readonly 需求测试尝试记录[]): string {
  let 已运行 = 尝试们.length > 0
  let { 测试思路, 结论补充 } = 流程.获得说明()
  let 结论 = 归纳执行结论(尝试们)
  let 标记 = 状态标记(结论.状态, 流程状态样式[结论.状态])
  let 记录 = 尝试们
    .map(({ 尝试序号, 结果, 附件们, 附件错误们, 清理错误们 }, 索引) => {
      let 错误 =
        结果.错误 === undefined || 结果.步骤们.some((步骤) => 步骤.状态 !== '未执行' && 步骤.错误 === 结果.错误)
          ? ''
          : 生成错误Html(结果.错误)
      let 附件错误 = 附件错误们.length === 0 ? '' : `<p>附件收集错误</p>${附件错误们.map(生成错误Html).join('')}`
      let 清理错误 = 清理错误们.length === 0 ? '' : `<p>资源清理错误</p>${清理错误们.map(生成错误Html).join('')}`
      let 错误们 = 错误 + 附件错误 + 清理错误
      return `<details class="run"${索引 === 尝试们.length - 1 ? ' open' : ''}>
        <summary class="runhead">第 ${String(尝试序号)} 次尝试 · ${结果.状态} · ${格式化耗时(结果.耗时毫秒)}</summary>
        ${错误们 === '' ? '' : `<div class="run-problems">${错误们}</div>`}
        ${生成步骤Html(`${id}-attempt-${String(尝试序号)}`, 结果.步骤们)}${生成流程附件Html(附件们)}</details>`
    })
    .join('')
  let 计划 = 已运行
    ? ''
    : `<h4 class="plan-steps">计划步骤</h4>
    ${生成步骤Html(
      `${id}-plan`,
      流程
        .获得步骤们()
        .map((步骤) => ({ 名称: 步骤.获得描述(), 类型: 步骤 instanceof 行为 ? '行为' : '观察', 状态: '未执行' })),
    )}`
  return `<section id="${id}" class="surface flow" data-flow hidden>
    <div class="flowhead">
    <div class="label">流程</div>
    <h3>${转义Html(流程.获得名称())} ${标记}</h3>
    <p><strong>对应文件：</strong><code>test/requirement/${转义Html(文件)}</code></p>
    ${测试思路 === undefined ? '' : `<p class="flow-approach flow-text"><strong>测试思路：</strong>${转义Html(测试思路)}</p>`}
    </div>${记录}${计划}${生成执行结论Html(id, 结论, 结论补充)}</section>`
}

function 生成报告目录(参数: 报告参数): {
  记录索引: ReadonlyMap<需求测试流程, readonly 需求测试尝试记录[]>
  流程编号们: readonly 目录流程[]
  需求条目们: readonly { 需求: 需求; 状态: 验收状态; 条目们: readonly 验收目录项[] }[]
} {
  let 记录索引 = new Map(参数.记录们.map(({ 测试, 尝试们 }) => [测试.流程, 尝试们]))
  let 流程编号们 = 参数.流程们.map(
    (测试, 索引): 目录流程 => ({
      测试,
      id: `flow-${String(索引 + 1)}`,
      状态: 记录索引.get(测试.流程)?.at(-1)?.结果.状态 ?? '未执行',
    }),
  )
  let 点序号 = 0
  let 需求条目们 = 参数.需求们.map((需求) => {
    let 条目们 = 需求.获得验收点们().map((点): 验收目录项 => {
      点序号 += 1
      let 关联流程们 = 流程编号们.filter(({ 测试 }) => 测试.流程.获得覆盖验收点们().includes(点))
      let 关联结果们 = 关联流程们
        .map(({ 测试 }) => 记录索引.get(测试.流程)?.at(-1)?.结果)
        .filter((结果) => 结果 !== undefined)
      let 状态: 验收状态 = 关联流程们.length === 0 ? '未实现' : '未执行'
      if (关联结果们.some((结果) => 结果.证明验收点们.includes(点))) 状态 = '已证明'
      else if (关联结果们.length > 0) 状态 = '未证明'
      return { id: `acceptance-${String(点序号)}`, 点, 状态, 关联流程们 }
    })
    let 状态 = 验收状态优先级.find((值) => 条目们.some((条目) => 条目.状态 === 值)) ?? '已证明'
    return { 需求, 状态, 条目们 }
  })
  return { 记录索引, 流程编号们, 需求条目们 }
}

function 生成报告Html(
  报告目录: string,
  参数: 报告参数,
  摘要: 报告摘要,
  { 记录索引, 流程编号们, 需求条目们 }: ReturnType<typeof 生成报告目录>,
): string {
  let 导航: string[] = []
  let 需求卡片: string[] = []
  let 验收卡片: string[] = []
  for (let [序号, { 需求, 状态: 需求状态, 条目们 }] of 需求条目们.entries()) {
    let id = `requirement-${String(序号 + 1)}`
    let 名称 = 转义Html(需求.获得名称())
    let 导航验收点 = 条目们
      .map((条目) => {
        let 验收点名称 = 转义Html(条目.点.获得名称())
        let 有流程 = 条目.关联流程们.length > 0
        let 流程按钮 = 有流程
          ? `<button type="button" class="point-toggle" aria-label="${验收点名称}的流程" aria-expanded="false" aria-controls="${条目.id}-flows"></button>`
          : ''
        let 流程列表 = 有流程
          ? `<ul class="flow-links" id="${条目.id}-flows" hidden>${生成关联流程链接(条目, true)}</ul>`
          : ''
        return `<div class="point-group"${有流程 ? ` data-acceptance-group="${条目.id}"` : ''}>
          <div class="point-row">
            ${流程按钮}
            <a class="point" href="#${条目.id}" data-acceptance="${条目.id}"><span class="point-name" title="${验收点名称}">${验收点名称}</span>
            ${目录状态标记(条目.状态, 验收状态样式(条目.状态))}</a>
          </div>
          ${流程列表}</div>`
      })
      .join('')
    let 状态计数: Record<验收状态, number> = { 已证明: 0, 未证明: 0, 未实现: 0, 未执行: 0 }
    for (let { 状态 } of 条目们) 状态计数[状态] += 1
    let 状态汇总 = 验收状态优先级
      .map((状态) => 状态标记(`${String(状态计数[状态])} 项${状态}`, 验收状态样式(状态)))
      .join('')
    导航.push(`<details class="requirement-group" name="requirement-directory" data-requirement-group="${id}">
      <summary class="requirement"><a class="requirement-name" href="#${id}" data-requirement-target="${id}" title="${名称}">${名称}</a><span class="requirement-meta">
      <span class="point-count">${String(条目们.length)} 项验收点</span>${目录状态标记(需求状态, 验收状态样式(需求状态))}</span></summary>
      <div class="points">${导航验收点}</div></details>`)
    let 验收点链接 = 条目们
      .map(
        ({ id, 点, 状态 }) =>
          `<li><a class="report-link" href="#${id}" data-acceptance="${id}">${转义Html(点.获得名称())}</a>${状态标记(状态, 验收状态样式(状态))}</li>`,
      )
      .join('')
    需求卡片.push(`<section id="${id}" class="surface hero" data-requirement hidden>
      <div class="label">需求</div><h1>${名称}</h1>
      <p class="report-description">${转义Html(需求.获得描述())}</p><div class="stats">${状态汇总}</div>
      <div class="report-related"><h2>验收点</h2><ul>${验收点链接}</ul></div></section>`)
    for (let 条目 of 条目们) {
      let 边框 = 条目.状态 === '已证明' ? '' : 条目.状态 === '未证明' ? ' failurebar' : ' pendingbar'
      验收卡片.push(`<section id="${条目.id}" class="surface pointcard${边框}" data-point data-requirement-id="${id}" data-flow-ids="${条目.关联流程们.map(({ id }) => id).join(' ')}" hidden>
        <div class="label">验收点</div><h2>${转义Html(条目.点.获得名称())}</h2>
        <p class="report-description">${转义Html(条目.点.获得描述())}</p>
        <p><strong>状态：</strong>${状态标记(条目.状态, 验收状态样式(条目.状态))}</p>
        <div class="report-related"><h3>关联流程</h3>${条目.关联流程们.length === 0 ? '<p class="muted">暂无关联流程。</p>' : `<ul>${生成关联流程链接(条目, false)}</ul>`}</div></section>`)
    }
  }

  let 流程卡片 = 流程编号们.map(({ 测试, id }) => 生成流程Html(id, 测试, 记录索引.get(测试.流程) ?? [])).join('')
  let 空状态说明 = 需求条目们.length === 0 ? '没有已登记的需求测试。' : '请选择左侧目录中的需求、验收点或流程。'
  let 日志链接 = [
    { 文件: 'server.stdout.log', 名称: '服务日志（stdout）' },
    { 文件: 'server.stderr.log', 名称: '服务日志（stderr）' },
  ]
    .filter(({ 文件 }) => statSync(path.join(报告目录, 文件), { throwIfNoEntry: false })?.isFile() === true)
    .map(({ 文件, 名称 }) => `<a href="${文件}">${名称}</a>`)
    .join(' ')
  let 基础设施错误 =
    参数.基础设施错误们.length === 0
      ? ''
      : `<section class="surface hero"><h2>运行环境错误</h2><pre class="problem">${转义Html(参数.基础设施错误们.join('\n'))}</pre></section>`
  let 中断提示 =
    参数.中断码 === undefined
      ? ''
      : `<section class="surface hero"><h2>测试运行已中断</h2><p>退出码 ${String(参数.中断码)}</p></section>`
  let 服务地址 = 参数.服务地址 === undefined ? '' : ` · ${转义Html(参数.服务地址)}`
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>需求测试报告</title><style>${样式}</style></head>
    <body><header><div class="bar"><div class="brand"><span class="mark" aria-hidden="true">✓</span>需求测试报告</div>
    <div class="bar-meta"><span class="sample">${转义Html(new Date(参数.开始时间).toLocaleString())} · ${参数.模式}${服务地址}</span>${日志链接}
    <label class="theme-control">主题 <select aria-label="主题" data-report-theme><option value="system">跟随系统</option>
    <option value="light">浅色</option><option value="dark">深色</option></select></label></div></div></header>
    <div class="layout">
      <nav id="report-directory" class="surface nav" aria-label="需求和验收点"><div class="navhead"><span class="label">需求目录</span></div>${导航.join('')}
        <div class="navfoot">通过 ${String(摘要.通过数)} · 失败 ${String(摘要.失败数)} · 中断 ${String(摘要.中断数)} · 未执行 ${String(摘要.未执行数)}</div></nav>
      <div class="directory-resizer" role="separator" aria-orientation="vertical" aria-label="调整需求目录宽度" aria-controls="report-directory" tabindex="0"></div>
      <main>${中断提示}${基础设施错误}${需求卡片.join('')}${验收卡片.join('')}${流程卡片}
        <p class="surface hero" data-no-selection>${空状态说明}</p></main>
    </div>
    <dialog class="image-dialog" aria-labelledby="report-image-title" data-image-dialog>
      <div class="image-dialog-head"><h2 id="report-image-title" data-image-title></h2>
        <div class="image-dialog-actions">${生成切图控件('')}
          <form method="dialog"><button type="submit">关闭</button></form>
        </div>
      </div>
      <img data-full-image alt="" tabindex="-1" autofocus>
    </dialog>
    <script>${交互脚本}</script></body></html>`
}

export function 保存需求测试报告(报告目录: string, 参数: 报告参数): { html路径: string; 全部通过: boolean } {
  let 流程记录们 = 参数.记录们.map(({ 测试, 尝试们 }) => {
    let 执行结论 = 归纳执行结论(尝试们)
    let 目标验收点们 = 测试.流程.获得覆盖验收点们()
    return {
      流程名称: 测试.流程.获得名称(),
      文件: `test/requirement/${测试.文件}`,
      需求名称们: 测试.需求们.map((值) => 值.获得名称()),
      目标验收点名称们: 目标验收点们.map((点) => 点.获得名称()),
      目标验收点描述们: 目标验收点们.map((点) => 点.获得描述()),
      ...测试.流程.获得说明(),
      执行结论,
      状态: 执行结论.状态,
      尝试们: 尝试们.map(({ 结果, ...尝试 }) => {
        let { 证明验收点们, ...描述 } = 结果
        return {
          ...尝试,
          ...描述,
          已证明验收点名称们: 证明验收点们.map((点) => 点.获得名称()),
          已证明验收点描述们: 证明验收点们.map((点) => 点.获得描述()),
        }
      }),
    }
  })
  let 摘要 = {
    开始时间: new Date(参数.开始时间).toISOString(),
    结束时间: new Date(参数.结束时间).toISOString(),
    模式: 参数.模式,
    服务地址: 参数.服务地址,
    Node版本: process.version,
    平台: process.platform,
    总流程数: 流程记录们.length,
    通过数: 流程记录们.filter((值) => 值.状态 === '通过').length,
    失败数: 流程记录们.filter((值) => 值.状态 === '失败').length,
    中断数: 流程记录们.filter((值) => 值.状态 === '中断').length,
    未执行数: 流程记录们.filter((值) => 值.状态 === '未执行').length,
    总耗时毫秒: Math.max(0, 参数.结束时间 - 参数.开始时间),
  }
  let 目录 = 生成报告目录(参数)
  let html = 生成报告Html(报告目录, 参数, 摘要, 目录)
  mkdirSync(报告目录, { recursive: true })
  let html路径 = path.join(报告目录, 'index.html')
  writeFileSync(html路径, html, 'utf8')
  writeFileSync(
    path.join(报告目录, 'report.json'),
    JSON.stringify(
      {
        ...摘要,
        基础设施错误们: 参数.基础设施错误们,
        覆盖错误们: 参数.覆盖错误们,
        中断码: 参数.中断码,
        选中流程名称们: 参数.选中流程们.map(({ 流程 }) => 流程.获得名称()),
        需求们: 目录.需求条目们.map(({ 需求, 状态, 条目们 }) => ({
          名称: 需求.获得名称(),
          描述: 需求.获得描述(),
          状态,
          验收点们: 条目们.map(({ 点, 状态, 关联流程们 }) => ({
            名称: 点.获得名称(),
            描述: 点.获得描述(),
            状态,
            关联流程名称们: 关联流程们.map(({ 测试 }) => 测试.流程.获得名称()),
          })),
        })),
        流程记录们,
      },
      undefined,
      2,
    ),
    'utf8',
  )
  return {
    html路径,
    全部通过:
      摘要.通过数 === 摘要.总流程数 &&
      参数.中断码 === undefined &&
      参数.基础设施错误们.length === 0 &&
      参数.覆盖错误们.length === 0,
  }
}
