import crossSpawn from 'cross-spawn'
import { mkdirSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

import { 集成测试 } from '../../../src/model/test-integration'

/** 集成测试结果只是一次实例运行返回的数据，不具有独立行为。 */
type 集成测试结果 = {
  测试名称: string
  测试文件名: string
  相对路径: string
  状态: 'passed' | 'failed'
  耗时毫秒: number
  标准输出: string
  错误输出: string
  开始时间: string
  结束时间: string
}

/** 集成测试报告产物只是保存操作的返回数据，不建立没有行为的类。 */
type 集成测试报告产物 = { html路径: string; json路径: string; 全部通过: boolean }

/**
 * 集成测试报告是全部集成测试结果的可持久化汇总。
 * 它持有运行环境、数量、耗时和用例结果，能够生成并保存 HTML 与 JSON 报告。
 */
class 集成测试报告 {
  private readonly 执行时间: string
  private readonly 总测试数: number
  private readonly 通过数: number
  private readonly 失败数: number
  private readonly 总耗时毫秒: number
  private readonly Node版本: string
  private readonly 平台: string
  private readonly 用例列表: readonly 集成测试结果[]
  public constructor(结果列表: readonly 集成测试结果[], 开始时间: number, 结束时间: number) {
    this.执行时间 = new Date().toLocaleString()
    this.总测试数 = 结果列表.length
    this.通过数 = 结果列表.filter((结果) => 结果.状态 === 'passed').length
    this.失败数 = 结果列表.length - this.通过数
    this.总耗时毫秒 = Math.max(0, 结束时间 - 开始时间)
    this.Node版本 = process.version
    this.平台 = process.platform
    this.用例列表 = [...结果列表]
  }
  public 保存(输出目录: string): 集成测试报告产物 {
    mkdirSync(输出目录, { recursive: true })
    let html路径 = path.join(输出目录, 'index.html')
    let json路径 = path.join(输出目录, 'report.json')
    writeFileSync(html路径, this.生成Html(), 'utf8')
    writeFileSync(json路径, JSON.stringify(this, undefined, 2), 'utf8')
    return { html路径, json路径, 全部通过: this.失败数 === 0 }
  }
  private 转义Html(值: string): string {
    return 值
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }
  private 清理Ansi(值: string): string {
    return 值.replace(/\u001B\[[0-9;]*[a-zA-Z]/g, '')
  }
  private 格式化耗时(毫秒: number): string {
    return 毫秒 < 1000 ? `${String(毫秒)} ms` : `${(毫秒 / 1000).toFixed(2)} s`
  }
  private 生成用例Html(结果: 集成测试结果): string {
    let 标准输出 = this.转义Html(this.清理Ansi(结果.标准输出.trim()))
    let 错误输出 = this.转义Html(this.清理Ansi(结果.错误输出.trim()))
    let 日志Html = [
      错误输出 === '' ? '' : `<h4>错误输出</h4><pre class="error">${错误输出}</pre>`,
      标准输出 === '' ? '' : `<h4>标准输出</h4><pre>${标准输出}</pre>`,
    ].join('')
    if (日志Html === '') 日志Html = '<p class="muted">没有控制台输出</p>'
    return `<details class="case ${结果.状态}" ${结果.状态 === 'failed' ? 'open' : ''}>
      <summary><span class="badge">${结果.状态.toUpperCase()}</span><strong>${this.转义Html(结果.测试名称)}</strong><span>${this.格式化耗时(结果.耗时毫秒)}</span></summary>
      <div class="detail"><p class="muted">${this.转义Html(结果.相对路径)} · ${this.转义Html(结果.开始时间)} - ${this.转义Html(结果.结束时间)}</p>${日志Html}</div>
    </details>`
  }
  private 生成Html(): string {
    let 用例Html = this.用例列表.map((结果) => this.生成用例Html(结果)).join('')
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>集成测试报告</title><style>
    :root{color-scheme:light dark;--bg:#f6f7fb;--card:#fff;--text:#172033;--muted:#667085;--border:#dfe3eb;--ok:#087443;--bad:#b42318;--code:#101828}
    @media(prefers-color-scheme:dark){:root{--bg:#0c111d;--card:#182230;--text:#f2f4f7;--muted:#98a2b3;--border:#344054;--ok:#32d583;--bad:#f97066;--code:#080b12}}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 system-ui,sans-serif}.container{max-width:1100px;margin:auto;padding:28px}
    header,.metrics,.case{background:var(--card);border:1px solid var(--border);border-radius:12px;margin-bottom:16px}header{padding:22px}h1,h4,p{margin-top:0}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);padding:16px;gap:12px}.metric{padding:10px}.metric strong{display:block;font-size:26px}.muted{color:var(--muted)}
    summary{display:flex;gap:12px;align-items:center;cursor:pointer;padding:16px}summary strong{flex:1}.passed .badge{color:var(--ok)}.failed .badge,.error{color:var(--bad)}
    .detail{border-top:1px solid var(--border);padding:18px}pre{white-space:pre-wrap;word-break:break-word;background:var(--code);color:#e4e7ec;padding:12px;border-radius:8px;max-height:480px;overflow:auto}
    @media(max-width:720px){.metrics{grid-template-columns:repeat(2,1fr)}.container{padding:14px}}
    </style></head><body><main class="container"><header><h1>集成测试报告</h1><p class="muted">${this.转义Html(this.执行时间)} · Node ${this.转义Html(this.Node版本)} · ${this.转义Html(this.平台)}</p></header>
    <section class="metrics"><div class="metric"><span>测试总数</span><strong>${String(this.总测试数)}</strong></div><div class="metric"><span>通过</span><strong>${String(this.通过数)}</strong></div><div class="metric"><span>失败</span><strong>${String(this.失败数)}</strong></div><div class="metric"><span>总耗时</span><strong>${this.格式化耗时(this.总耗时毫秒)}</strong></div></section>${用例Html}</main></body></html>`
  }
}

type 集成测试登记 = { 文件名: string; 相对路径: string; 测试: 集成测试 }
type 集成测试运行选项 = {
  全部运行: boolean
  自动打开报告: boolean
  指定用例: 集成测试登记 | undefined
  附加参数们: readonly string[]
}
type 写入回调 = (错误?: Error | null) => void

/**
 * 集成测试运行器负责发现并顺序执行项目中的集成测试实例。
 * 它记录测试与报告目录，维护文件和实例的登记关系，并汇总每项测试的输出与结果。
 * 可以通过它筛选测试、直接调用实例并保存报告，单项失败会记录后继续其余测试。
 */
export class 集成测试运行器 {
  private readonly 根目录: string
  private readonly 测试目录: string
  private readonly 报告目录: string
  private readonly 入口Schema = z.object({
    default: z.custom<new () => 集成测试>(
      (值) => typeof 值 === 'function' && 值.prototype instanceof 集成测试,
      '测试入口必须默认导出集成测试子类',
    ),
  })
  private 运行中 = false

  public constructor(根目录: string) {
    if (path.isAbsolute(根目录) === false) throw new Error('集成测试项目根目录必须是绝对路径')
    this.根目录 = 根目录
    this.测试目录 = path.join(根目录, 'test/integration')
    this.报告目录 = path.join(根目录, 'test-outputs/integration-report')
  }

  public async 发现测试(): Promise<readonly 集成测试登记[]> {
    let 文件们 = (await fs.readdir(this.测试目录))
      .filter((文件) => 文件.endsWith('.ts'))
      .sort((左, 右) => 左.localeCompare(右))
    let 登记们: 集成测试登记[] = []
    let 已登记名称们 = new Set<string>()
    for (let 文件名 of 文件们) {
      let 绝对路径 = path.join(this.测试目录, 文件名)
      let 入口 = this.入口Schema.safeParse(await import(pathToFileURL(绝对路径).href))
      if (入口.success === false)
        throw new Error(`集成测试文件“${文件名}”未默认导出有效的测试子类`, { cause: 入口.error })
      let 测试 = new 入口.data.default()
      let 名称 = 测试.获得名称()
      if (已登记名称们.has(名称)) throw new Error(`集成测试包含重复名称：${名称}`)
      已登记名称们.add(名称)
      登记们.push({ 文件名, 相对路径: path.relative(this.根目录, 绝对路径).replaceAll('\\', '/'), 测试 })
    }
    return 登记们
  }

  public async 运行(参数们: readonly string[]): Promise<void> {
    if (this.运行中) throw new Error('同一集成测试运行器不能同时执行多次运行')
    this.运行中 = true
    try {
      let 登记们 = await this.发现测试()
      let 选项 = this.解析参数(参数们, 登记们)
      let 开始时间 = Date.now()
      let 结果们: 集成测试结果[] = []
      for (let 登记 of this.选择用例(选项, 登记们)) 结果们.push(await this.执行测试(登记, 选项.附加参数们))
      let 产物 = new 集成测试报告(结果们, 开始时间, Date.now()).保存(this.报告目录)
      console.log(`集成测试报告已生成：${pathToFileURL(产物.html路径).href}`)
      if (选项.自动打开报告) {
        let 打开结果 = crossSpawn.sync('open-cli', [产物.html路径], {
          cwd: this.根目录,
          stdio: ['ignore', 'inherit', 'inherit'],
        })
        if (打开结果.error !== undefined) throw 打开结果.error
        if (打开结果.status !== 0) throw new Error(`打开集成测试报告失败，退出码：${String(打开结果.status)}`)
      }
      if (产物.全部通过 === false) throw new Error('部分集成测试未通过，请查看集成测试报告')
    } finally {
      this.运行中 = false
    }
  }

  private 解析参数(参数们: readonly string[], 登记们: readonly 集成测试登记[]): 集成测试运行选项 {
    let 全部运行 = false
    let 自动打开报告 = false
    let 指定用例: 集成测试登记 | undefined
    let 附加参数们: string[] = []
    for (let 参数 of 参数们) {
      if (参数 === '--all') 全部运行 = true
      else if (参数 === '--open') 自动打开报告 = true
      else {
        let 基础文件名 = path.basename(参数.replaceAll('\\', '/'))
        let 用例 = 登记们.find((登记) => 登记.文件名 === 基础文件名 || 登记.文件名 === `${基础文件名}.ts`)
        if (用例 !== undefined && 指定用例 === undefined) 指定用例 = 用例
        else 附加参数们.push(参数)
      }
    }
    return { 全部运行, 自动打开报告, 指定用例, 附加参数们 }
  }

  private 选择用例(选项: 集成测试运行选项, 登记们: readonly 集成测试登记[]): readonly 集成测试登记[] {
    if (选项.全部运行 || 选项.指定用例 === undefined) return 登记们
    return [选项.指定用例]
  }

  private async 执行测试(登记: 集成测试登记, 附加参数们: readonly string[]): Promise<集成测试结果> {
    let 开始时间戳 = Date.now()
    let 开始时间 = new Date().toLocaleTimeString()
    let 标准输出 = ''
    let 错误输出 = ''
    let 状态: 集成测试结果['状态'] = 'passed'
    let 测试名称 = 登记.测试.获得名称()
    console.log(`\n开始执行集成测试：${测试名称}（${登记.文件名}）`)
    let 恢复标准输出 = this.捕获输出(process.stdout, (文本): void => {
      标准输出 += 文本
    })
    let 恢复错误输出 = this.捕获输出(process.stderr, (文本): void => {
      错误输出 += 文本
    })
    try {
      await 登记.测试.运行(附加参数们)
    } catch (错误) {
      状态 = 'failed'
      console.error(错误)
    } finally {
      恢复标准输出()
      恢复错误输出()
    }
    let 结束时间戳 = Date.now()
    console.log(`${测试名称}：${状态 === 'passed' ? '通过' : '失败'}（${String(结束时间戳 - 开始时间戳)}ms）`)
    return {
      测试名称,
      测试文件名: 登记.文件名,
      相对路径: 登记.相对路径,
      状态,
      耗时毫秒: 结束时间戳 - 开始时间戳,
      标准输出,
      错误输出,
      开始时间,
      结束时间: new Date().toLocaleTimeString(),
    }
  }

  private 捕获输出(流: NodeJS.WriteStream, 追加: (文本: string) => void): () => void {
    let 原始写入 = 流.write
    let 写入 = 原始写入.bind(流)
    let 解码器 = new StringDecoder('utf8')
    流.write = (数据: string | Uint8Array, 编码或回调?: BufferEncoding | 写入回调, 回调?: 写入回调): boolean => {
      let 编码 = typeof 编码或回调 === 'string' ? 编码或回调 : 'utf8'
      追加(解码器.write(typeof 数据 === 'string' ? Buffer.from(数据, 编码) : Buffer.from(数据)))
      if (typeof 编码或回调 === 'string') return 写入(数据, 编码或回调, 回调)
      return 写入(数据, 编码或回调 ?? 回调)
    }
    return (): void => {
      流.write = 原始写入
      追加(解码器.end())
    }
  }
}

let 入口文件 = process.argv[1]
if (入口文件 !== undefined && pathToFileURL(path.resolve(入口文件)).href === import.meta.url) {
  try {
    let 根目录 = path.resolve(import.meta.dirname, '../../../')
    await new 集成测试运行器(根目录).运行(process.argv.slice(2))
    process.exit(0)
  } catch (错误) {
    console.error(错误)
    process.exit(1)
  }
}
