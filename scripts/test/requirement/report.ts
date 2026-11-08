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
  流程们: readonly 需求测试登记[]
  选中流程们: readonly 需求测试登记[]
  记录们: readonly 需求测试记录[]
  基础设施错误们: readonly string[]
  中断码: number | undefined
}
type 验收状态 = '已证明' | '待人工' | '未证明' | '未执行'
type 验收目录项 = { id: string; 点: 验收点; 状态: 验收状态; 流程id组: string[] }
type 步骤记录 = 需求测试结果['步骤们'][number]
type 标记样式 = 'ok' | 'manual' | 'neutral' | 'fail'
type 报告摘要 = { 通过数: number; 失败数: number; 中断数: number; 未执行数: number }
type 图片附件 = Extract<流程步骤附件, { 类型: '图片' }>

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
    case '待人工':
      return 'manual'
    case '未证明':
      return 'fail'
    case '未执行':
      return 'neutral'
  }
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

function 生成图片组Html(图片们: readonly 图片附件[]): string {
  if (图片们.length === 0) return ''
  let 控件 =
    图片们.length === 1
      ? ''
      : `<div class="gallery-controls">
        <button type="button" data-prev aria-label="上一张">‹</button>
        <span data-index aria-live="polite">1 / ${String(图片们.length)}</span>
        <button type="button" data-next aria-label="下一张">›</button>
      </div>`
  let 图片组 = 图片们
    .map((附件, 索引) => {
      let 说明 = 转义Html(附件.说明 ?? `步骤图片 ${String(索引 + 1)}`)
      return `<figure class="gallery-frame" data-frame${索引 === 0 ? '' : ' hidden'}>
        <button type="button" class="step-image" data-zoom aria-pressed="false" aria-label="放大或缩小图片">
          <img src="data:${转义Html(附件.内容类型)};base64,${转义Html(附件.内容)}" alt="${说明}" loading="lazy">
        </button><figcaption>${说明}</figcaption></figure>`
    })
    .join('')
  return `<div data-gallery>${控件}${图片组}</div>`
}

function 生成步骤附件Html(附件们: readonly 流程步骤附件[]): string {
  if (附件们.length === 0) return ''
  let 内容们: string[] = []
  let 图片们: 图片附件[] = []
  for (let 附件 of 附件们) {
    switch (附件.类型) {
      case '文本':
        内容们.push(生成图片组Html(图片们), `<p>${转义Html(附件.内容)}</p>`)
        图片们 = []
        break
      case '图片':
        图片们.push(附件)
        break
    }
  }
  内容们.push(生成图片组Html(图片们))
  return `<div class="step-attachments">${内容们.join('')}</div>`
}

function 生成步骤Html(步骤们: readonly 步骤记录[]): string {
  return `<ol class="timeline">${步骤们
    .map((步骤, 序号) => {
      let 观察 = 步骤.类型 === '观察'
      let 状态 = 步骤.状态 === '通过' && 观察 === false ? '已执行' : 步骤.状态
      let 样式 = 步骤.状态 === '失败' ? ' fail' : 步骤.状态 === '中断' ? ' manual' : ''
      let 耗时 = 步骤.状态 === '未执行' ? '' : ` · ${格式化耗时(步骤.耗时毫秒)}`
      let 错误 = 步骤.状态 === '未执行' || 步骤.错误 === undefined ? '' : 生成错误Html(步骤.错误)
      let 取证错误们 =
        步骤.状态 === '未执行' || 步骤.取证错误们.length === 0
          ? ''
          : `<details class="problems"><summary>取证错误</summary>${步骤.取证错误们.map(生成错误Html).join('')}</details>`
      return `<li class="step${观察 ? ' observe' : ''}"><span class="num">${String(序号 + 1).padStart(2, '0')}</span>
      <div class="stepbody"><div class="stepmeta"><span class="type">${步骤.类型}</span>
      <span class="timing${样式}">${状态}${耗时}</span></div><h4>${转义Html(步骤.名称)}</h4>
      ${步骤.状态 === '未执行' ? '' : 生成步骤附件Html(步骤.附件们)}${错误}${取证错误们}</div></li>`
    })
    .join('')}</ol>`
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

function 生成流程Html(
  id: string,
  { 流程, 文件 }: 需求测试登记,
  尝试们: readonly 需求测试尝试记录[],
  覆盖验收点们: readonly 验收目录项[],
): string {
  let 已运行 = 尝试们.length > 0
  let 最后结果 = 尝试们.at(-1)?.结果
  let 状态样式: Record<需求测试结果['状态'], 标记样式> = { 通过: 'ok', 失败: 'fail', 中断: 'manual' }
  let 标记 =
    最后结果 === undefined
      ? 状态标记('本次未执行', 流程.包含人工验收() ? 'manual' : 'neutral')
      : 状态标记(
          尝试们.length > 1
            ? `${最后结果.状态} · ${String(尝试们.length)} 次尝试`
            : `${最后结果.状态} · ${格式化耗时(最后结果.耗时毫秒)}`,
          状态样式[最后结果.状态],
        )
  let 覆盖 = 覆盖验收点们
    .map(({ id, 点 }) => `<a class="cover" href="#${id}" data-acceptance="${id}">${转义Html(点.获得描述())}</a>`)
    .join('')
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
        ${生成步骤Html(结果.步骤们)}${生成流程附件Html(附件们)}</details>`
    })
    .join('')
  let 计划 = 已运行
    ? ''
    : `<p class="empty">${流程.包含人工验收() ? '这条流程需要独立人工验收。' : '本次运行未执行这条流程。'}以下仅列出计划步骤。</p>
    ${生成步骤Html(
      流程
        .获得步骤们()
        .map((步骤) => ({ 名称: 步骤.获得描述(), 类型: 步骤 instanceof 行为 ? '行为' : '观察', 状态: '未执行' })),
    )}`
  return `<section id="${id}" class="surface flow" data-flow>
    <div class="flowhead"><div class="headline"><div class="label">${已运行 ? '流程执行记录' : '计划流程'}</div>${标记}</div>
    <h3>${转义Html(流程.获得名称())}</h3><p class="muted">test/requirement/${转义Html(文件)}</p>
    <div class="cover-title" id="${id}-coverage">本流程覆盖的验收点 · ${String(覆盖验收点们.length)} 项</div>
    <div class="covers" role="group" aria-labelledby="${id}-coverage">${覆盖}</div></div>${记录}${计划}</section>`
}

function 获得验收目录项(索引: ReadonlyMap<验收点, 验收目录项>, 点: 验收点): 验收目录项 {
  let 条目 = 索引.get(点)
  if (条目 === undefined) throw new Error(`报告中缺少验收点：${点.获得描述()}`)
  return 条目
}

function 生成报告Html(报告目录: string, 参数: 报告参数, 摘要: 报告摘要): string {
  let 需求们 = [...new Set(参数.流程们.flatMap((测试) => 测试.需求们))]
  let 记录索引 = new Map(参数.记录们.map(({ 测试, 尝试们 }) => [测试.流程, 尝试们]))
  let 流程编号们 = 参数.流程们.map((测试, 索引) => ({ 测试, id: `flow-${String(索引 + 1)}` }))
  let 点索引 = new Map<验收点, 验收目录项>()
  for (let 需求 of 需求们) {
    for (let 点 of 需求.获得验收点们()) {
      let 索引 = 点索引.size + 1
      let 关联流程们 = 流程编号们.filter(({ 测试 }) => 测试.流程.获得覆盖验收点们().includes(点))
      let 关联结果们 = 关联流程们
        .map(({ 测试 }) => 记录索引.get(测试.流程)?.at(-1)?.结果)
        .filter((结果) => 结果 !== undefined)
      let 状态: 验收状态 = '未执行'
      if (关联结果们.some((结果) => 结果.证明验收点们.includes(点))) 状态 = '已证明'
      else if (点.需要人工验收()) 状态 = '待人工'
      else if (关联结果们.length > 0) 状态 = '未证明'
      点索引.set(点, { id: `acceptance-${String(索引)}`, 点, 状态, 流程id组: 关联流程们.map(({ id }) => id) })
    }
  }

  let 导航: string[] = []
  let 需求卡片: string[] = []
  let 验收卡片: string[] = []
  for (let [序号, 需求] of 需求们.entries()) {
    let id = `requirement-${String(序号 + 1)}`
    let 名称 = 转义Html(需求.获得名称())
    let 条目们 = 需求.获得验收点们().map((点) => 获得验收目录项(点索引, 点))
    let 导航验收点 = 条目们
      .map(
        (条目) =>
          `<a class="point" href="#${条目.id}" data-acceptance="${条目.id}">
        <span>${转义Html(条目.点.获得描述())}</span>${状态标记(条目.状态, 验收状态样式(条目.状态))}</a>`,
      )
      .join('')
    导航.push(`<details class="requirement-group" data-requirement-group="${id}">
      <summary class="requirement"><span>${名称}</span><span class="point-count">${String(条目们.length)} 项验收点</span></summary>
      <div class="points">${导航验收点}</div></details>`)
    let 状态组: 验收状态[] = ['已证明', '待人工', '未证明', '未执行']
    let 状态汇总 = 状态组
      .map((状态) => {
        let 数量 = 条目们.filter((条目) => 条目.状态 === 状态).length
        return 数量 === 0 ? '' : 状态标记(`${String(数量)} 项${状态}`, 验收状态样式(状态))
      })
      .join('')
    需求卡片.push(`<section id="${id}" class="surface hero" data-requirement>
      <div class="breadcrumb">需求测试 <span>›</span> 需求详情</div><h1>${名称}</h1>
      <p class="muted">${转义Html(需求.获得描述())}</p><div class="stats">${状态汇总}</div></section>`)
    for (let 条目 of 条目们) {
      let 状态说明: Record<验收状态, string> = {
        已证明: '关联流程执行成功，并证明了此验收点。',
        待人工: '此验收点需要人工核验，本次自动报告未提供验收证据。',
        未证明: '本次执行记录未证明此验收点，请查看关联流程的结果。',
        未执行: '本次没有执行覆盖此验收点的流程。',
      }
      let 边框 = 条目.状态 === '已证明' ? '' : 条目.状态 === '未证明' ? ' failurebar' : ' pendingbar'
      验收卡片.push(`<section id="${条目.id}" class="surface pointcard${边框}" data-point data-requirement-id="${id}" data-flow-ids="${条目.流程id组.join(' ')}">
        <div class="headline"><div><div class="label">验收点</div><h2>${转义Html(条目.点.获得描述())}</h2></div>
        ${状态标记(条目.状态, 验收状态样式(条目.状态))}</div>
        <p class="muted">验收手段为${条目.点.获得验收手段()}。${状态说明[条目.状态]}</p></section>`)
    }
  }

  let 流程卡片 = 流程编号们
    .map(({ 测试, id }) =>
      生成流程Html(
        id,
        测试,
        记录索引.get(测试.流程) ?? [],
        测试.流程.获得覆盖验收点们().map((点) => 获得验收目录项(点索引, 点)),
      ),
    )
    .join('')
  let 验收项们 = [...点索引.values()]
  let 初始项 = 验收项们.find((项) => 项.状态 === '未证明') ?? 验收项们.find((项) => 项.状态 === '已证明') ?? 验收项们[0]
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
    <div class="layout" data-initial-point="${初始项?.id ?? ''}">
      <nav class="surface nav" aria-label="需求和验收点"><div class="navhead"><span class="label">需求目录</span></div>${导航.join('')}
        <div class="navfoot">通过 ${String(摘要.通过数)} · 失败 ${String(摘要.失败数)} · 中断 ${String(摘要.中断数)} · 未执行 ${String(摘要.未执行数)}</div></nav>
      <main>${中断提示}${基础设施错误}${需求卡片.join('')}${验收卡片.join('')}${流程卡片}
        ${验收项们.length === 0 ? '<p class="surface hero">没有已登记的需求测试。</p>' : '<p class="foot">按流程执行顺序展示步骤，附件随对应步骤呈现。</p>'}</main>
    </div><script>${交互脚本}</script></body></html>`
}

export function 保存需求测试报告(报告目录: string, 参数: 报告参数): { html路径: string; 全部通过: boolean } {
  let 流程记录们 = 参数.记录们.map(({ 测试, 尝试们 }) => ({
    流程名称: 测试.流程.获得名称(),
    文件: `test/requirement/${测试.文件}`,
    需求名称们: 测试.需求们.map((值) => 值.获得名称()),
    目标验收点描述们: 测试.流程.获得覆盖验收点们().map((值) => 值.获得描述()),
    状态: 尝试们.at(-1)?.结果.状态 ?? '未执行',
    尝试们: 尝试们.map(({ 结果, ...尝试 }) => {
      let { 证明验收点们, ...描述 } = 结果
      return { ...尝试, ...描述, 已证明验收点描述们: 证明验收点们.map((值) => 值.获得描述()) }
    }),
  }))
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
  let html = 生成报告Html(报告目录, 参数, 摘要)
  mkdirSync(报告目录, { recursive: true })
  let html路径 = path.join(报告目录, 'index.html')
  writeFileSync(html路径, html, 'utf8')
  writeFileSync(
    path.join(报告目录, 'report.json'),
    JSON.stringify(
      {
        ...摘要,
        基础设施错误们: 参数.基础设施错误们,
        中断码: 参数.中断码,
        选中流程名称们: 参数.选中流程们.map(({ 流程 }) => 流程.获得名称()),
        人工流程名称们: 参数.选中流程们.filter(({ 流程 }) => 流程.包含人工验收()).map(({ 流程 }) => 流程.获得名称()),
        流程记录们,
      },
      undefined,
      2,
    ),
    'utf8',
  )
  return {
    html路径,
    全部通过: 摘要.通过数 === 摘要.总流程数 && 参数.中断码 === undefined && 参数.基础设施错误们.length === 0,
  }
}
