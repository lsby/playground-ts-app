import { statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { 浏览器测试模式 } from '../../../src/model/browser-test'
import type { 执行结果 } from './attempt'
import type { 端到端测试错误详情 } from './format-error'
import { 交互脚本, 样式 } from './report-page'

type 用例标识 = { 文件: string; 名称: string }
type 报告参数 = {
  模式: 浏览器测试模式
  服务地址: string | undefined
  开始时间: string
  耗时毫秒: number
  通过数: number
  失败数: number
  用例们: readonly 用例标识[]
  记录们: readonly 执行结果[]
  基础设施错误们: readonly string[]
  中断码: number | undefined
}
type 用例状态 = 执行结果['状态'] | '重试后通过' | '未执行'
type 用例详情 = 用例标识 & { id: string; 状态: 用例状态; 尝试们: readonly 执行结果[] }
type 步骤记录 = 执行结果['步骤们'][number]
type 文件链接 = { 名称: string; 地址: string }

let 状态样式: Record<用例状态, string> = {
  通过: 'ok',
  失败: 'fail',
  中断: 'warning',
  重试后通过: 'warning',
  未执行: 'pending',
}

function 转义Html(文本: string): string {
  return 文本.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function 格式化耗时(毫秒: number): string {
  return 毫秒 < 1000 ? `${String(毫秒)} ms` : `${(毫秒 / 1000).toFixed(2)} s`
}

function 状态标记(状态: 用例状态, 文本: string = 状态): string {
  return `<span class="badge ${状态样式[状态]}">${转义Html(文本)}</span>`
}

function 获得用例详情(报告: 报告参数): 用例详情[] {
  let 按文件记录 = new Map<string, 执行结果[]>()
  for (let 记录 of 报告.记录们) {
    let 记录们 = 按文件记录.get(记录.文件)
    if (记录们 === undefined) 按文件记录.set(记录.文件, [记录])
    else 记录们.push(记录)
  }
  return 报告.用例们.map((用例, 序号) => {
    let 尝试们 = 按文件记录.get(用例.文件) ?? []
    let 状态: 用例状态 = 尝试们.at(-1)?.状态 ?? '未执行'
    if (状态 === '通过' && 尝试们.some((尝试) => 尝试.状态 === '失败')) 状态 = '重试后通过'
    return { ...用例, id: `case-${String(序号 + 1)}`, 尝试们, 状态 }
  })
}

function 获得文件链接(目录: string, 名称: string, 相对路径: string): 文件链接 | undefined {
  let 路径段们 = 相对路径.split('/')
  if (路径段们.some((段) => 段 === '' || 段 === '.' || 段 === '..' || 段.includes('\\') || 段.includes(':'))) {
    throw new Error(`非法的端到端测试报告附件路径：${相对路径}`)
  }
  if (statSync(path.join(目录, ...路径段们), { throwIfNoEntry: false })?.isFile() !== true) return undefined
  return { 名称: 转义Html(名称), 地址: 转义Html(路径段们.map(encodeURIComponent).join('/')) }
}

function 生成截图链接(链接: 文件链接, 证据?: { 阶段: string; 隐藏: boolean }): string {
  let 标题 = 证据 === undefined ? 链接.名称 : `${转义Html(证据.阶段)} · ${链接.名称}`
  return `<a class="shot" data-screenshot href="${链接.地址}" target="_blank" rel="noopener"${证据?.隐藏 === true ? ' hidden' : ''}>
    <img src="${链接.地址}" alt="${标题}" loading="lazy"><span>${标题} · 查看大图</span></a>`
}

function 生成证据切换控件(总数?: number): string {
  return `<div class="evidence-controls" data-evidence-controls role="group" aria-label="切换证据"${总数 === undefined ? ' hidden' : ''}>
    <button type="button" class="tool evidence-arrow" data-evidence-prev aria-label="上一张证据" aria-disabled="true">‹</button>
    <span data-evidence-position aria-live="polite">${总数 === undefined ? '' : `1 / ${String(总数)}`}</span>
    <button type="button" class="tool evidence-arrow" data-evidence-next aria-label="下一张证据">›</button>
  </div>`
}

function 生成步骤证据(目录: string, 步骤: 步骤记录): string {
  if (步骤.状态 === '未执行') return ''
  let 截图们 = (步骤.证据们 ?? []).flatMap((证据) => {
    let 链接 = 获得文件链接(目录, 证据.名称, 证据.相对路径)
    return 链接 === undefined ? [] : [{ 链接, 阶段: 证据.阶段 }]
  })
  let 截图Html = 截图们.map(({ 链接, 阶段 }, 序号) => 生成截图链接(链接, { 阶段, 隐藏: 序号 > 0 })).join('')
  let 多图 = 截图们.length > 1
  let 证据组 =
    截图Html === ''
      ? ''
      : `<div class="evidence-gallery"${多图 ? ' data-evidence-gallery' : ''}>
      ${多图 ? 生成证据切换控件(截图们.length) : ''}${截图Html}</div>`
  let 取证错误们 = 步骤.取证错误们 ?? []
  let 错误Html =
    取证错误们.length === 0
      ? ''
      : `<details class="evidence-errors"><summary>截图采集错误</summary>
      ${取证错误们.map((错误) => `<pre>${转义Html(错误)}</pre>`).join('')}</details>`
  if (证据组 === '' && 错误Html === '') return ''
  return `<div class="step-evidence">${证据组}${错误Html}</div>`
}

function 生成步骤(目录: string, 步骤: 步骤记录): string {
  let 标志 = 步骤.状态 === '通过' ? '✓' : 步骤.状态 === '未执行' ? '–' : '!'
  let 耗时 = 步骤.状态 === '未执行' ? '' : `<span class="duration">${格式化耗时(步骤.耗时毫秒)}</span>`
  return `<li class="step ${状态样式[步骤.状态]}">
    <span class="dot" aria-hidden="true">${标志}</span>
    <div><strong>${转义Html(步骤.名称)}</strong><small>${步骤.类型} · ${步骤.状态}</small></div>${耗时}
    ${生成步骤证据(目录, 步骤)}</li>`
}

function 生成步骤错误(名称: string, 错误: 端到端测试错误详情): string {
  let 字段们 = [
    { 标签: '预期值', 值: 错误.预期值 },
    { 标签: '实际值', 值: 错误.实际值 },
    {
      标签: '源码位置',
      值: 错误.位置 === undefined ? undefined : `第 ${String(错误.位置.行)} 行，第 ${String(错误.位置.列)} 列`,
    },
  ]
    .map(({ 标签, 值 }) => (值 === undefined ? '' : `<dt>${标签}</dt><dd>${转义Html(值)}</dd>`))
    .join('')
  let 原始错误 = `<pre>${转义Html(错误.文本)}</pre>`
  let 消息 = 错误.消息 === undefined || 错误.消息.trim() === '' ? '' : `<pre>${转义Html(错误.消息)}</pre>`
  let 内容 =
    字段们 === '' && 消息 === ''
      ? 原始错误
      : `${字段们 === '' ? 消息 : `<dl>${字段们}</dl>`}
        <details><summary>原始错误</summary>${原始错误}</details>`
  return `<div class="problem"><strong>${转义Html(名称)}</strong>${内容}</div>`
}

function 生成尝试详情(目录: string, 尝试: 执行结果, id: string, 当前: boolean): string {
  let 步骤错误们 = new Set<string>()
  let 错误Html = 尝试.步骤们
    .map((步骤) => {
      if ('错误' in 步骤 === false) return ''
      步骤错误们.add(步骤.错误.文本)
      return 生成步骤错误(步骤.名称, 步骤.错误)
    })
    .join('')
  错误Html += 尝试.错误们
    .filter((错误) => 步骤错误们.has(错误) === false)
    .map((错误) => `<div class="problem"><pre>${转义Html(错误)}</pre></div>`)
    .join('')

  let 截图们: string[] = []
  let 附件链接们: string[] = []
  for (let 附件 of 尝试.附件们) {
    let 链接 = 获得文件链接(目录, 附件.名称, 附件.相对路径)
    if (链接 === undefined) continue
    if (附件.内容类型.startsWith('image/')) {
      截图们.push(生成截图链接(链接))
    } else {
      let 名称 = path.posix.basename(附件.相对路径) === 'browser-trace.zip' ? '下载浏览器 Trace' : 链接.名称
      附件链接们.push(`<a class="tool" href="${链接.地址}" download>${名称}</a>`)
    }
  }

  let 有步骤 = 尝试.步骤们.length > 0
  let 有详情 = 错误Html !== '' || 截图们.length > 0 || 附件链接们.length > 0
  let 步骤Html = 有步骤
    ? `<section><h3>步骤时间线</h3><ol class="steps">${尝试.步骤们.map((步骤) => 生成步骤(目录, 步骤)).join('')}</ol></section>`
    : ''
  let 附件Html = 附件链接们.length === 0 ? '' : `<div class="actions">${附件链接们.join('')}</div>`
  let 详情Html = 有详情
    ? `<section><h3>${错误Html === '' ? '执行附件' : 尝试.状态 === '中断' ? '中断详情' : '失败详情'}</h3>
      ${错误Html}${截图们.join('')}${附件Html}</section>`
    : ''
  let 样式类 = 有步骤 && 有详情 ? 'details-grid split' : 'details-grid'
  return `<div id="${id}" class="${样式类}" data-attempt-panel${当前 ? '' : ' hidden'}>${步骤Html}${详情Html}</div>`
}

function 生成用例详情(目录: string, 用例: 用例详情, 当前: boolean): string {
  let 尝试编号 = (索引: number): string => `${用例.id}-attempt-${String(索引 + 1)}`
  let 尝试导航 = 用例.尝试们.map((尝试, 索引) => {
    let 文本 = `第 ${String(尝试.尝试序号)} 次 · ${尝试.状态} · ${格式化耗时(尝试.耗时毫秒)}`
    if (用例.尝试们.length === 1) return `<span class="attempt-label">${文本}</span>`
    return `<button type="button" class="tool" data-attempt-select aria-controls="${尝试编号(索引)}"
      aria-pressed="${String(索引 === 用例.尝试们.length - 1)}">${文本}</button>`
  })
  return `<section id="${用例.id}" class="surface" data-case-panel${当前 ? '' : ' hidden'}>
    <div class="intro"><div class="label">用例详情</div>
      <div class="case-title"><h2>${转义Html(用例.名称)}</h2>${状态标记(用例.状态)}</div>
      <p class="file">test/e2e/${转义Html(用例.文件)}</p>
      ${尝试导航.length === 0 ? '' : `<div class="attempts" role="group" aria-label="尝试记录">${尝试导航.join('')}</div>`}
    </div>
    ${用例.尝试们.map((尝试, 索引) => 生成尝试详情(目录, 尝试, 尝试编号(索引), 索引 === 用例.尝试们.length - 1)).join('')}
  </section>`
}

function 生成报告Html(目录: string, 报告: 报告参数): string {
  let 用例们 = 获得用例详情(报告)
  let 初始用例 = 用例们.find((用例) => 用例.状态 === '失败') ?? 用例们.find((用例) => 用例.状态 === '中断') ?? 用例们[0]
  let 状态顺序: 用例状态[] = ['通过', '重试后通过', '失败', '中断', '未执行']
  let 汇总 = 状态顺序
    .map((状态) => {
      let 数量 = 用例们.filter((用例) => 用例.状态 === 状态).length
      return 数量 === 0 ? '' : 状态标记(状态, `${String(数量)} ${状态}`)
    })
    .join('')
  let 日志链接 = [
    获得文件链接(目录, '服务标准输出', 'server.stdout.log'),
    获得文件链接(目录, '服务错误输出', 'server.stderr.log'),
  ]
    .filter((链接) => 链接 !== undefined)
    .map((链接) => `<a href="${链接.地址}">${链接.名称}</a>`)
    .join('')
  let 导航 = 用例们
    .map((用例) => {
      let 耗时 = 用例.尝试们.length === 0 ? '' : 格式化耗时(用例.尝试们.reduce((合计, 尝试) => 合计 + 尝试.耗时毫秒, 0))
      return `<button class="case" type="button" data-case-select aria-controls="${用例.id}" aria-pressed="${String(用例 === 初始用例)}">
        <strong>${转义Html(用例.名称)}</strong><span class="case-meta">${状态标记(用例.状态)}${耗时}</span></button>`
    })
    .join('')
  let 基础设施错误 =
    报告.基础设施错误们.length === 0
      ? ''
      : `<section class="surface run-errors"><h2>运行环境错误</h2>
      ${报告.基础设施错误们.map((错误) => `<div class="problem"><pre>${转义Html(错误)}</pre></div>`).join('')}</section>`
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>端到端测试报告</title><style>${样式}</style></head>
  <body><header class="top"><div class="bar"><h1><span class="mark" aria-hidden="true">✓</span>端到端测试报告</h1>
    <div class="top-meta">${日志链接}<label>主题 <select data-theme-picker>
      <option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option>
    </select></label></div></div></header>
  <section class="run"><div class="bar"><div><h2>本次运行</h2><p class="muted">
    <time datetime="${转义Html(报告.开始时间)}">${转义Html(new Date(报告.开始时间).toLocaleString())}</time>
    · ${报告.模式}模式 · ${String(用例们.length)} 个用例 · ${格式化耗时(报告.耗时毫秒)}
    ${报告.中断码 === undefined ? '' : ' · 运行中断'}
    ${报告.服务地址 === undefined ? '' : ` · ${转义Html(报告.服务地址)}`}</p></div>
    <div class="counts">${汇总}</div></div></section>
  <div class="layout">
    <nav class="surface directory" aria-label="测试用例"><div class="label">用例目录</div>${导航}</nav>
    <main>${基础设施错误}${用例们.map((用例) => 生成用例详情(目录, 用例, 用例 === 初始用例)).join('')}</main>
  </div>
  <dialog aria-labelledby="screenshot-title" data-screenshot-dialog>
    <div class="dialog-head"><h2 id="screenshot-title" data-screenshot-title tabindex="-1" autofocus></h2>
      <div class="dialog-actions">${生成证据切换控件()}
        <form method="dialog"><button type="submit" class="tool">关闭</button></form></div></div>
    <img data-full-image alt="">
  </dialog>
  <script>${交互脚本}</script></body></html>`
}

export async function 保存端到端测试报告(目录: string, 报告: 报告参数): Promise<string> {
  let html路径 = path.join(目录, 'index.html')
  await writeFile(path.join(目录, 'report.json'), JSON.stringify(报告, undefined, 2), 'utf8')
  await writeFile(html路径, 生成报告Html(目录, 报告), 'utf8')
  return html路径
}
