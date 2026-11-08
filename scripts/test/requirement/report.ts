import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  行为,
  type 流程步骤附件,
  type 需求,
  type 需求测试流程,
  type 需求测试结果,
  type 需求测试附件,
  type 验收点,
} from '../../../src/model/test-requirement'

type 需求测试登记 = { 流程: 需求测试流程; 需求们: readonly 需求[] }
export type 需求测试附件记录 = Omit<需求测试附件, '路径'> & { 相对路径: string }
export type 需求测试记录 = { 测试: 需求测试登记; 结果: 需求测试结果; 附件们: readonly 需求测试附件记录[] }

type 报告参数 = {
  服务地址: string
  开始时间: number
  结束时间: number
  流程们: readonly 需求测试登记[]
  记录们: readonly 需求测试记录[]
  基础设施错误: string | undefined
}
type 验收状态 = '已证明' | '待人工' | '未证明' | '未执行'
type 验收目录项 = { id: string; 点: 验收点; 状态: 验收状态; 流程id组: string[] }
type 步骤记录 = 需求测试结果['步骤们'][number]
type 步骤条目 = Pick<步骤记录, '名称' | '类型'> & Partial<步骤记录>
type 标记样式 = 'ok' | 'manual' | 'neutral' | 'fail'

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

function 生成步骤附件Html(附件们: readonly 流程步骤附件[]): string {
  if (附件们.length === 0) return ''
  let 内容 = 附件们
    .map((附件, 序号) => {
      switch (附件.类型) {
        case '文本':
          return `<p>${转义Html(附件.内容)}</p>`
        case '图片':
          return `<button type="button" class="step-image" aria-pressed="false" aria-label="放大步骤附件 ${String(序号 + 1)}" title="点击放大或缩小">
            <img src="data:${转义Html(附件.内容类型)};base64,${转义Html(附件.内容)}" alt="步骤附件 ${String(序号 + 1)}" loading="lazy">
          </button>`
      }
    })
    .join('')
  return `<div class="step-attachments">${内容}</div>`
}

function 生成步骤Html(步骤们: readonly 步骤条目[]): string {
  return `<ol class="timeline">${步骤们
    .map((步骤, 序号) => {
      let 观察 = 步骤.类型 === '观察'
      let 状态 = 步骤.状态 === '通过' && 观察 === false ? '已执行' : (步骤.状态 ?? '未执行')
      let 耗时 = 步骤.耗时毫秒 === undefined ? '' : ` · ${格式化耗时(步骤.耗时毫秒)}`
      let 错误 = 步骤.错误 === undefined ? '' : `<pre class="problem">${转义Html(步骤.错误)}</pre>`
      return `<li class="step${观察 ? ' observe' : ''}"><span class="num">${String(序号 + 1).padStart(2, '0')}</span>
      <div class="stepbody"><div class="stepmeta"><span class="type">${步骤.类型}</span>
      <span class="timing${步骤.状态 === '失败' ? ' fail' : ''}">${状态}${耗时}</span></div><h4>${转义Html(步骤.名称)}</h4>
      ${步骤.附件们 === undefined ? '' : 生成步骤附件Html(步骤.附件们)}${错误}</div></li>`
    })
    .join('')}</ol>`
}

function 生成流程附件Html(附件们: readonly 需求测试附件记录[]): string {
  if (附件们.length === 0) return ''
  let 列表 = 附件们
    .map((项) => {
      let 地址 = 项.相对路径.split('/').map(encodeURIComponent).join('/')
      let 新标签页 = 项.内容类型?.startsWith('image/') === true ? ' target="_blank" rel="noopener"' : ''
      return `<li><a href="${转义Html(地址)}"${新标签页}>${转义Html(项.名称)}</a></li>`
    })
    .join('')
  return `<details class="attachments"><summary>流程附件 · ${String(附件们.length)} 项</summary><ul>${列表}</ul></details>`
}

function 生成流程Html(
  id: string,
  流程: 需求测试流程,
  记录们: readonly 需求测试记录[],
  覆盖验收点们: readonly 验收目录项[],
): string {
  let 已运行 = 记录们.length > 0
  let 多次运行 = 记录们.length > 1
  let 最后结果 = 记录们.at(-1)?.结果
  let 标记 =
    最后结果 === undefined
      ? 状态标记('本次未执行', 流程.包含人工验收() ? 'manual' : 'neutral')
      : 状态标记(
          多次运行 ? `${String(记录们.length)} 次执行` : `${最后结果.状态} · ${格式化耗时(最后结果.耗时毫秒)}`,
          记录们.some((记录) => 记录.结果.状态 === '失败') ? 'fail' : 'ok',
        )
  let 覆盖 = 覆盖验收点们
    .map(({ id, 点 }) => `<a class="cover" href="#${id}" data-acceptance="${id}">${转义Html(点.获得描述())}</a>`)
    .join('')
  let 记录 = 记录们
    .map(({ 结果, 附件们 }, 序号) => {
      let 状态 = 多次运行
        ? `<h4 class="runhead">第 ${String(序号 + 1)} 次执行 · ${结果.状态} · ${格式化耗时(结果.耗时毫秒)}</h4>`
        : ''
      let 错误 =
        结果.错误 === undefined || 结果.步骤们.some((步骤) => 步骤.错误 === 结果.错误)
          ? ''
          : `<pre class="problem">${转义Html(结果.错误)}</pre>`
      return `<div class="run">${状态}${错误}${生成步骤Html(结果.步骤们)}${生成流程附件Html(附件们)}</div>`
    })
    .join('')
  let 计划 = 已运行
    ? ''
    : `<p class="empty">${流程.包含人工验收() ? '这条流程需要独立人工验收。' : '本次运行未执行这条流程。'}以下仅列出计划步骤。</p>
    ${生成步骤Html(流程.获得步骤们().map((步骤) => ({ 名称: 步骤.获得描述(), 类型: 步骤 instanceof 行为 ? '行为' : '观察' })))}`
  return `<section id="${id}" class="surface flow" data-flow>
    <div class="flowhead"><div class="headline"><div class="label">${已运行 ? '流程执行记录' : '计划流程'}</div>${标记}</div>
    <h3>${转义Html(流程.获得名称())}</h3><div class="cover-title" id="${id}-coverage">本流程覆盖的验收点 · ${String(覆盖验收点们.length)} 项</div>
    <div class="covers" role="group" aria-labelledby="${id}-coverage">${覆盖}</div></div>${记录}${计划}</section>`
}

function 获得验收目录项(索引: ReadonlyMap<验收点, 验收目录项>, 点: 验收点): 验收目录项 {
  let 条目 = 索引.get(点)
  if (条目 === undefined) throw new Error(`报告中缺少验收点：${点.获得描述()}`)
  return 条目
}

function 生成报告Html(报告目录: string, 参数: 报告参数, 失败数: number): string {
  let 需求们 = [...new Set(参数.流程们.flatMap((测试) => 测试.需求们))]
  let 记录索引 = new Map<需求测试流程, 需求测试记录[]>()
  for (let 记录 of 参数.记录们) {
    let 流程 = 记录.测试.流程
    let 已登记 = 记录索引.get(流程)
    if (已登记 === undefined) 记录索引.set(流程, [记录])
    else 已登记.push(记录)
  }
  let 流程编号们 = 参数.流程们.map(({ 流程 }, 索引) => ({ 流程, id: `flow-${String(索引 + 1)}` }))
  let 点索引 = new Map<验收点, 验收目录项>()
  for (let 需求 of 需求们) {
    for (let 点 of 需求.获得验收点们()) {
      let 索引 = 点索引.size + 1
      let 关联流程们 = 流程编号们.filter(({ 流程 }) => 流程.获得覆盖验收点们().includes(点))
      let 关联记录们 = 关联流程们.flatMap(({ 流程 }) => 记录索引.get(流程) ?? [])
      let 状态: 验收状态 = '未执行'
      if (关联记录们.some(({ 结果 }) => 结果.证明验收点们.includes(点))) 状态 = '已证明'
      else if (点.需要人工验收()) 状态 = '待人工'
      else if (关联记录们.length > 0) 状态 = '未证明'
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
    .map(({ 流程, id }) =>
      生成流程Html(
        id,
        流程,
        记录索引.get(流程) ?? [],
        流程.获得覆盖验收点们().map((点) => 获得验收目录项(点索引, 点)),
      ),
    )
    .join('')
  let 验收项们 = [...点索引.values()]
  let 初始项 = 验收项们.find((项) => 项.状态 === '未证明') ?? 验收项们.find((项) => 项.状态 === '已证明') ?? 验收项们[0]
  let 日志链接 = [
    { 文件: 'server.stdout.log', 名称: '服务标准输出' },
    { 文件: 'server.stderr.log', 名称: '服务错误输出' },
  ]
    .filter(({ 文件 }) => {
      let 状态 = statSync(path.join(报告目录, 文件), { throwIfNoEntry: false })
      return 状态 !== undefined && 状态.mtimeMs >= 参数.开始时间
    })
    .map(({ 文件, 名称 }) => `<a href="${文件}">${名称}</a>`)
    .join(' ')
  let 基础设施错误 =
    参数.基础设施错误 === undefined
      ? ''
      : `<section class="surface hero"><h2>运行环境错误</h2><pre class="problem">${转义Html(参数.基础设施错误)}</pre></section>`
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>需求测试报告</title><style>${样式}</style></head>
    <body><header><div class="bar"><div class="brand"><span class="mark" aria-hidden="true">✓</span>需求测试报告</div>
    <div class="bar-meta"><span class="sample">${转义Html(new Date(参数.开始时间).toLocaleString())} · ${转义Html(参数.服务地址)}</span>${日志链接}
    <label class="theme-control">主题 <select aria-label="主题" data-report-theme><option value="system">跟随系统</option>
    <option value="light">浅色</option><option value="dark">深色</option></select></label></div></div></header>
    <div class="layout" data-initial-point="${初始项?.id ?? ''}">
      <nav class="surface nav" aria-label="需求和验收点"><div class="navhead"><span class="label">需求目录</span></div>${导航.join('')}
        <div class="navfoot">已运行 ${String(参数.记录们.length)} 条流程 · ${String(失败数)} 条失败</div></nav>
      <main>${基础设施错误}${需求卡片.join('')}${验收卡片.join('')}${流程卡片}
        ${验收项们.length === 0 ? '<p class="surface hero">没有已登记的需求测试。</p>' : '<p class="foot">按流程执行顺序展示步骤，附件随对应步骤呈现。</p>'}</main>
    </div><script>${交互脚本}</script></body></html>`
}

export function 保存需求测试报告(报告目录: string, 参数: 报告参数): { html路径: string; 全部通过: boolean } {
  let 流程记录们 = 参数.记录们.map(({ 测试, 结果, 附件们 }) => {
    let { 证明验收点们, 附件们: _附件们, ...描述 } = 结果
    return {
      ...描述,
      流程名称: 测试.流程.获得名称(),
      需求名称们: 测试.需求们.map((值) => 值.获得名称()),
      目标验收点描述们: 测试.流程.获得覆盖验收点们().map((值) => 值.获得描述()),
      已证明验收点描述们: 证明验收点们.map((值) => 值.获得描述()),
      附件们,
    }
  })
  let 失败数 = 流程记录们.filter((值) => 值.状态 === '失败').length
  let 摘要 = {
    执行时间: new Date(参数.开始时间).toLocaleString(),
    服务地址: 参数.服务地址,
    Node版本: process.version,
    平台: process.platform,
    总流程数: 流程记录们.length,
    通过数: 流程记录们.length - 失败数,
    失败数,
    总耗时毫秒: Math.max(0, 参数.结束时间 - 参数.开始时间),
  }
  let html = 生成报告Html(报告目录, 参数, 失败数)
  mkdirSync(报告目录, { recursive: true })
  let html路径 = path.join(报告目录, 'index.html')
  writeFileSync(html路径, html, 'utf8')
  writeFileSync(
    path.join(报告目录, 'report.json'),
    JSON.stringify({ ...摘要, 基础设施错误: 参数.基础设施错误, 流程记录们 }, undefined, 2),
    'utf8',
  )
  return { html路径, 全部通过: 失败数 === 0 && 参数.基础设施错误 === undefined }
}

let 交互脚本 = `
  let themeControl = document.querySelector('[data-report-theme]')
  let themeKey = 'requirement-report-theme'
  function applyTheme(value) {
    if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value
    else delete document.documentElement.dataset.theme
  }
  try {
    let savedTheme = localStorage.getItem(themeKey)
    if (savedTheme === 'light' || savedTheme === 'dark') {
      themeControl.value = savedTheme
      applyTheme(savedTheme)
    }
  } catch { /* 本地 HTML 或隐私设置可能禁止访问浏览器存储。 */ }
  themeControl.addEventListener('change', () => {
    applyTheme(themeControl.value)
    try {
      if (themeControl.value === 'system') localStorage.removeItem(themeKey)
      else localStorage.setItem(themeKey, themeControl.value)
    } catch { /* 当前页面仍可切换主题。 */ }
  })

  let layout = document.querySelector('[data-initial-point]')
  let points = [...document.querySelectorAll('[data-point]')]
  let requirements = [...document.querySelectorAll('[data-requirement]')]
  let requirementGroups = [...document.querySelectorAll('[data-requirement-group]')]
  let flows = [...document.querySelectorAll('[data-flow]')]
  let links = [...document.querySelectorAll('[data-acceptance]')]
  function showPoint(id) {
    let selected = points.find(point => point.id === id)
    if (!selected) return null
    let flowIds = selected.dataset.flowIds.split(' ')
    let group = requirementGroups.find(group => group.dataset.requirementGroup === selected.dataset.requirementId)
    if (group) group.open = true
    for (let point of points) point.hidden = point !== selected
    for (let requirement of requirements) requirement.hidden = requirement.id !== selected.dataset.requirementId
    for (let flow of flows) flow.hidden = !flowIds.includes(flow.id)
    for (let link of links) {
      if (link.dataset.acceptance === id) link.setAttribute('aria-current', 'true')
      else link.removeAttribute('aria-current')
    }
    return selected
  }
  function showFromHash() {
    let selected = showPoint(location.hash.slice(1))
    if (!selected) showPoint(layout.dataset.initialPoint)
  }
  for (let link of links) {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      let selected = showPoint(link.dataset.acceptance)
      if (!selected) return
      if (location.hash !== link.hash) history.pushState(null, '', link.hash)
      if (matchMedia('(max-width:620px)').matches) selected.scrollIntoView({block:'start'})
      else window.scrollTo(0, 0)
    })
  }
  for (let imageButton of document.querySelectorAll('.step-image')) {
    imageButton.onclick = () => imageButton.setAttribute('aria-pressed', String(imageButton.getAttribute('aria-pressed') !== 'true'))
  }
  addEventListener('hashchange', showFromHash)
  showFromHash()
`

let 样式 = `
*{box-sizing:border-box}
html{color-scheme:light dark}
html[data-theme=light]{color-scheme:light}
html[data-theme=dark]{color-scheme:dark}
body{margin:0;background:light-dark(#f2f5f4,#111a17);color:light-dark(#182824,#e5f0ea);font:14px/1.55 "Microsoft YaHei","PingFang SC",system-ui,sans-serif}
button{font:inherit}
a:focus-visible,button:focus-visible,summary:focus-visible,select:focus-visible{outline:2px solid light-dark(#367b68,#7bc7a8);outline-offset:2px}
header{background:light-dark(#183d34,#122c23);color:light-dark(#fff,#e5f0ea)}
.bar{max-width:1440px;margin:auto;min-height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 36px;gap:12px}
.brand{display:flex;gap:12px;align-items:center;font-weight:700;font-size:17px;letter-spacing:.03em}
.mark{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:light-dark(#d3f0da,#b4e4ca);color:light-dark(#1b543f,#173f30)}
.sample{border:1px solid light-dark(#5f8278,#668d7d);color:light-dark(#f1fcf6,#e2f3e9);padding:4px 10px;border-radius:7px;font-size:12px}
.layout{max-width:1440px;margin:auto;padding:28px 36px 44px;display:grid;grid-template-columns:310px minmax(0,1fr);gap:24px;align-items:start}
.surface{background:light-dark(#fff,#1a2621);border:1px solid light-dark(#dbe4df,#35483f);border-radius:12px}
.nav{position:sticky;top:20px;max-height:calc(100vh - 40px);overflow:auto}
.navhead{padding:21px 19px 13px}
.label{font-size:12px;letter-spacing:.1em;font-weight:700;color:light-dark(#526d63,#a8c6b8)}
.requirement-group{margin:0 12px 8px}
.requirement{padding:12px 10px;background:light-dark(#f5f8f6,#24352d);border-radius:8px;display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:9px;font-size:15px;font-weight:700;cursor:pointer;list-style:none;overflow-wrap:anywhere}
.requirement::-webkit-details-marker{display:none}
.requirement::before{content:"";width:6px;height:6px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:rotate(-45deg)}
.requirement-group[open]>.requirement::before{transform:rotate(45deg)}
.point-count{color:light-dark(#60736b,#a6bfb4);font-size:12px;font-weight:400;white-space:nowrap}
.points{display:grid;padding:6px 0 2px;gap:3px}
.point{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;text-align:left;border:1px solid transparent;border-radius:8px;background:light-dark(#fff,#1a2621);padding:10px 7px;color:light-dark(#263c33,#daece2);cursor:pointer;text-decoration:none;overflow-wrap:anywhere}
.point:hover{background:light-dark(#f4f8f5,#293b32)}
.point[aria-current=true]{background:light-dark(#e8f4ed,#254838);border-color:light-dark(#a4c9b6,#527e69)}
.point .badge{justify-self:end;justify-content:center;min-width:52px;font-size:11px}
.muted{color:light-dark(#52665e,#b5c9bf)}
.navfoot{border-top:1px solid light-dark(#e2e9e5,#35483f);padding:15px 18px;font-size:12px;color:light-dark(#52665e,#b5c9bf)}
.layout main{min-width:0}
.hero{padding:20px 25px 22px;margin-bottom:16px}
.breadcrumb{color:light-dark(#5d7167,#a9c0b5);font-size:12px}
.breadcrumb span{padding:0 7px;color:light-dark(#7c9287,#91ac9f)}
h1{margin:4px 0 6px;font-size:29px;line-height:1.27;letter-spacing:-.015em}
p{margin:0}
.stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.badge{display:inline-flex;align-items:center;gap:5px;border-radius:6px;padding:3px 8px;font-size:12px;line-height:1.35;font-weight:650;white-space:nowrap}
.ok{color:light-dark(#155e43,#a9e7c9);background:light-dark(#e1f2e8,#234837)}
.manual{color:light-dark(#765118,#f3d094);background:light-dark(#fff2d8,#463720)}
.neutral{color:light-dark(#475f55,#c2d6ca);background:light-dark(#edf2ef,#32443b)}
.pointcard{padding:19px 25px;margin-bottom:16px;border-left:4px solid light-dark(#43886c,#6bba98)}
.pointcard.pendingbar{border-left-color:light-dark(#be8a3d,#d0a65e)}
.headline{display:flex;justify-content:space-between;align-items:start;gap:10px}
.pointcard h2{font-size:21px;margin:4px 0 5px;line-height:1.4}
.flow{overflow:hidden}
.flowhead{padding:20px 25px 17px;border-bottom:1px solid light-dark(#e3ebe6,#35483f)}
.flowhead h3{font-size:19px;margin:5px 0 6px;line-height:1.4}
.cover-title{margin-top:10px;color:light-dark(#52665e,#b5c9bf);font-size:12px}
.covers{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.cover{border:1px solid light-dark(#d8e5dd,#456052);border-radius:5px;font-size:11px;padding:2px 6px;color:light-dark(#4a6559,#b0cbbb)}
.cover[aria-current=true]{background:light-dark(#e7f3ec,#254838);color:light-dark(#225e48,#ace4ca);border-color:light-dark(#c4dfd0,#527e69)}
.timeline{list-style:none;margin:0;padding:12px 25px 17px}
.step{position:relative;display:grid;grid-template-columns:35px minmax(0,1fr);gap:10px;padding:9px 0}
.step:not(:last-child)::after{position:absolute;content:"";width:1px;left:13px;top:38px;bottom:-9px;background:light-dark(#cddcd4,#456052)}
.num{display:grid;place-items:center;width:28px;height:28px;background:light-dark(#eff3f1,#25372e);border:1px solid light-dark(#dbe4df,#35483f);border-radius:50%;font-size:12px;color:light-dark(#4a675a,#b4cebf);font-variant-numeric:tabular-nums}
.observe .num{background:light-dark(#e5f3eb,#254838);color:light-dark(#17664a,#a7e2c6);border-color:light-dark(#b9d9c9,#527e69)}
.stepbody{padding-top:2px;min-width:0}
.stepmeta{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:4px}
.stepmeta .type{font-size:12px;font-weight:700;color:light-dark(#516d61,#a9c6b8)}
.observe .stepmeta .type{color:light-dark(#216e51,#9ddcbd)}
.timing{font-size:12px;color:light-dark(#576d62,#a8beb3);white-space:nowrap}
.step h4{font-size:15px;margin:0;font-weight:670}
.step-attachments{display:grid;gap:8px;margin-top:9px;background:light-dark(#f4faf6,#1d3228);border:1px solid light-dark(#d4e7dc,#395e4d);border-radius:8px;padding:10px 12px}
.step-attachments p{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}
.step-image{display:block;width:min(65%,420px);padding:0;border:0;background:none;border-radius:6px;cursor:zoom-in}
.step-image[aria-pressed="true"]{width:100%;cursor:zoom-out}
.step-image img{display:block;width:100%;height:auto;border-radius:6px}
.attachments summary{font-size:12px;color:light-dark(#2f6752,#a2dfc3);cursor:pointer}
.empty{margin:16px 25px 0;padding:12px 14px;background:light-dark(#fff7e9,#382c1a);color:light-dark(#785415,#f3d094);border-radius:7px}
.attachments{border-top:1px solid light-dark(#e3ebe6,#35483f);padding:14px 25px;color:light-dark(#597165,#a8beb3);font-size:12px}
.attachments p{margin-top:7px}
.foot{margin:13px 2px 0;color:light-dark(#5c7166,#a8beb3);font-size:12px}
@media(max-width:850px){.layout{grid-template-columns:220px minmax(0,1fr);padding:16px;gap:12px}
.bar{padding:0 16px}
.flowhead,.hero,.pointcard,.timeline{padding-left:16px;padding-right:16px}}
@media(max-width:620px){.layout{display:block}
.nav{position:static;max-height:none;margin-bottom:15px}
.point{padding:7px}
.hero h1{font-size:24px}
.headline{flex-wrap:wrap}}
[hidden]{display:none!important}
.bar-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.bar-meta a{color:light-dark(#e1f2e8,#b4e4ca);font-size:12px}
.theme-control{display:flex;align-items:center;gap:6px;font-size:12px}
.theme-control select{font:inherit;color:inherit;background:transparent;border:1px solid light-dark(#5f8278,#668d7d);border-radius:7px;padding:4px 6px}
.theme-control option{color:CanvasText;background:Canvas}
.fail{color:light-dark(#922f28,#ffb8b0);background:light-dark(#fbeae7,#482824)}
.pointcard.failurebar{border-left-color:light-dark(#bd5147,#e18175)}
.problem{margin-top:9px;border-radius:6px;background:light-dark(#fff0ee,#38211e);padding:9px 10px;color:light-dark(#822d26,#ffb8b0);white-space:pre-wrap;overflow-wrap:anywhere}
.flow+.flow{margin-top:16px}
.cover{text-decoration:none}
.cover:hover{text-decoration:underline}
.runhead{margin:13px 25px 0;font-size:13px}
.run+.run{border-top:1px solid light-dark(#e3ebe6,#35483f)}
.attachments ul{margin:8px 0 0;padding-left:20px}
.attachments a{color:light-dark(#2f6752,#a2dfc3)}
@media(max-width:620px){.bar{padding-top:10px;padding-bottom:10px}.bar-meta{gap:5px}.runhead{margin-left:16px}.empty{margin-left:16px;margin-right:16px}}
`
