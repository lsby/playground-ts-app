import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspect, parseArgs, stripVTControlCharacters } from 'node:util'
import { z } from 'zod'

import { 全局资源 } from '../../../src/global/global'
import { 浏览器测试引擎, type 浏览器测试模式 } from '../../../src/model/browser-test'
import { 端到端测试 } from '../../../src/model/test-e2e'
import { 测试服务 } from '../test-server'

type 端到端测试选项 = { 目标们: readonly string[]; 模式: 浏览器测试模式 | undefined; 仅列出: boolean }
type 端到端测试登记 = { 文件: string; 类: new () => 端到端测试 }
type 测试附件 = { 名称: string; 相对路径: string; 内容类型: string }
type 执行结果 = {
  名称: string
  文件: string
  状态: '通过' | '失败'
  尝试序号: number
  耗时毫秒: number
  错误们: string[]
  附件们: 测试附件[]
}

/**
 * 端到端测试运行器管理项目里的浏览器测试用例及其运行环境。
 * 它记录用例和报告位置，使用独立的测试服务及浏览器会话执行选中的流程。
 * 用例按顺序执行，运行结果、浏览器附件和服务日志集中写入报告。
 */
export class 端到端测试运行器 {
  private readonly 测试目录: string
  private readonly 报告目录: string
  private readonly 入口Schema = z.object({
    default: z.custom<new () => 端到端测试>(
      (值): 值 is new () => 端到端测试 => typeof 值 === 'function' && 值.prototype instanceof 端到端测试,
      '测试入口必须默认导出端到端测试的子类',
    ),
  })

  public constructor(private readonly 根目录: string) {
    if (path.isAbsolute(根目录) === false) throw new Error('端到端测试项目根目录必须是绝对路径')
    this.测试目录 = path.join(根目录, 'test/e2e')
    this.报告目录 = path.join(根目录, 'test-outputs/e2e-report')
  }

  public 解析参数(参数们: readonly string[]): 端到端测试选项 {
    let { values, positionals } = parseArgs({
      args: [...参数们],
      allowPositionals: true,
      options: {
        all: { type: 'boolean' },
        list: { type: 'boolean' },
        auto: { type: 'boolean' },
        demo: { type: 'boolean' },
        mode: { type: 'string' },
      },
    })
    if (values.mode !== undefined && values.mode !== 'auto' && values.mode !== 'demo') {
      throw new Error('--mode 后必须提供 auto 或 demo')
    }
    let 自动模式 = values.auto === true || values.mode === 'auto'
    let 演示模式 = values.demo === true || values.mode === 'demo'
    if (自动模式 && 演示模式) throw new Error('不能同时选择自动与演示模式')
    if (values.all === true && positionals.length > 0) throw new Error('--all 不能与指定测试文件一起使用')
    return {
      目标们: values.all === true ? ['--all'] : positionals,
      模式: 演示模式 ? '演示' : 自动模式 ? '自动' : undefined,
      仅列出: values.list === true,
    }
  }

  public async 扫描测试文件(): Promise<string[]> {
    let 项们 = await readdir(this.测试目录, { recursive: true, withFileTypes: true })
    return 项们
      .filter((项) => 项.isFile() && 项.name.endsWith('.ts'))
      .map((项) => this.获得相对路径(this.测试目录, path.join(项.parentPath, 项.name)))
      .filter((文件) => 文件.startsWith('helper/') === false)
      .sort((左, 右) => 左.localeCompare(右))
  }

  public async 运行(参数们: readonly string[]): Promise<number> {
    let 选项 = this.解析参数(参数们)
    let 文件们 = this.选择测试文件(await this.扫描测试文件(), 选项.目标们)
    let 测试们: 端到端测试登记[] = []
    for (let 文件 of 文件们) {
      let 入口 = this.入口Schema.safeParse(await import(pathToFileURL(path.join(this.测试目录, 文件)).href))
      if (入口.success === false) throw new Error(`端到端测试文件“${文件}”的默认导出无效`, { cause: 入口.error })
      测试们.push({ 文件, 类: 入口.data.default })
    }
    if (选项.仅列出) {
      for (let 测试 of 测试们) console.log(`${测试.文件} · ${测试.类.name}`)
      return 0
    }

    let 模式 = 选项.模式 ?? '自动'
    let 开始时间 = Date.now()
    await mkdir(this.报告目录, { recursive: true })
    let 本次报告目录 = await mkdtemp(path.join(this.报告目录, `${String(开始时间)}-`))
    let 服务 = new 测试服务(this.根目录, 'test:e2e:server', 本次报告目录)
    let 服务地址: string | undefined
    let 基础设施错误们: string[] = []
    let 记录们: 执行结果[] = []
    let 取消控制器 = new AbortController()
    let 中断码: number | undefined
    let 处理中断 = (退出码: number): void => {
      中断码 ??= 退出码
      取消控制器.abort(new Error('端到端测试已中断'))
      void 服务.关闭().catch((错误: unknown): void => console.error(错误))
    }
    let 处理SIGINT = (): void => 处理中断(130)
    let 处理SIGTERM = (): void => 处理中断(143)
    process.on('SIGINT', 处理SIGINT)
    process.on('SIGTERM', 处理SIGTERM)
    try {
      服务地址 = await 服务.启动()
      let 最大尝试次数 = 模式 === '自动' && process.env['CI'] !== undefined && process.env['CI'] !== '' ? 3 : 1
      for (let 测试 of 测试们) {
        for (let 尝试序号 = 1; 尝试序号 <= 最大尝试次数 && 中断码 === undefined; 尝试序号 += 1) {
          let 结果 = await this.执行测试(测试, { 服务地址, 模式, 尝试序号, 本次报告目录, 取消信号: 取消控制器.signal })
          记录们.push(结果)
          if (结果.状态 === '通过') break
        }
      }
    } catch (错误) {
      基础设施错误们.push(this.错误文本(错误))
    } finally {
      try {
        await 服务.关闭()
      } catch (错误) {
        基础设施错误们.push(this.错误文本(错误))
      } finally {
        process.off('SIGINT', 处理SIGINT)
        process.off('SIGTERM', 处理SIGTERM)
      }
    }
    let 最终结果们 = [...new Map(记录们.map((记录) => [记录.文件, 记录])).values()]
    let 失败数 = 最终结果们.filter((记录) => 记录.状态 === '失败').length
    await this.保存报告(本次报告目录, {
      模式,
      服务地址,
      开始时间: new Date(开始时间).toISOString(),
      耗时毫秒: Date.now() - 开始时间,
      通过数: 最终结果们.length - 失败数,
      失败数,
      记录们,
      基础设施错误们,
      中断码,
    })
    return 中断码 ?? (失败数 > 0 || 基础设施错误们.length > 0 ? 1 : 0)
  }

  private 选择测试文件(文件们: readonly string[], 目标们: readonly string[]): readonly string[] {
    if (文件们.length === 0) throw new Error('没有找到端到端测试文件')
    if (目标们.length === 0 || 目标们.includes('--all')) return 文件们
    let 选中文件们 = new Set<string>()
    for (let 目标 of 目标们) {
      let 文件名 = (path.isAbsolute(目标) ? this.获得相对路径(this.测试目录, 目标) : 目标)
        .replaceAll('\\', '/')
        .replace(/^\.\//, '')
        .replace(/^test\/e2e\//, '')
      let 匹配们 = 文件们.filter((文件) => 文件 === 文件名 || 文件 === `${文件名}.ts`)
      if (匹配们.length === 0 && 文件名.includes('/') === false) {
        匹配们 = 文件们.filter((文件) => path.basename(文件) === 文件名 || path.basename(文件) === `${文件名}.ts`)
      }
      let [文件] = 匹配们
      if (文件 === undefined) throw new Error(`找不到端到端测试文件：${目标}`)
      if (匹配们.length > 1) throw new Error(`端到端测试文件名有歧义，请提供相对路径：${目标}`)
      选中文件们.add(文件)
    }
    return 文件们.filter((文件) => 选中文件们.has(文件))
  }

  private async 执行测试(
    测试: 端到端测试登记,
    参数: { 服务地址: string; 模式: 浏览器测试模式; 尝试序号: number; 本次报告目录: string; 取消信号: AbortSignal },
  ): Promise<执行结果> {
    let 开始时间 = Date.now()
    let 错误们: string[] = []
    let 附件们: 测试附件[] = []
    console.log(`开始端到端测试：${测试.类.name}（${测试.文件}，第 ${String(参数.尝试序号)} 次）`)
    try {
      let 实例 = new 测试.类()
      let 会话 = await 浏览器测试引擎.打开会话({
        服务地址: 参数.服务地址,
        模式: 参数.模式,
        取消信号: 参数.取消信号,
        附件目录: path.join(参数.本次报告目录, 'attachments', 测试.文件, String(参数.尝试序号)),
      })
      try {
        参数.取消信号.throwIfAborted()
        await 实例.运行(会话.引擎)
      } catch (错误) {
        错误们.push(this.错误文本(错误))
      } finally {
        try {
          if (参数.取消信号.aborted === false) {
            附件们 = (await 会话.收集附件()).map((附件) => ({
              名称: 附件.名称,
              相对路径: this.获得相对路径(参数.本次报告目录, 附件.路径),
              内容类型: 附件.内容类型,
            }))
          }
        } catch (错误) {
          错误们.push(`收集浏览器附件失败：${this.错误文本(错误)}`)
        } finally {
          await 会话.关闭()
        }
      }
    } catch (错误) {
      错误们.push(this.错误文本(错误))
    }
    let 状态: 执行结果['状态'] = 错误们.length === 0 ? '通过' : '失败'
    if (错误们.length > 0) console.error(错误们.join('\n'))
    console.log(`${测试.类.name}：${状态}`)
    return {
      名称: 测试.类.name,
      文件: 测试.文件,
      状态,
      尝试序号: 参数.尝试序号,
      耗时毫秒: Date.now() - 开始时间,
      错误们,
      附件们,
    }
  }

  private async 保存报告(
    报告目录: string,
    报告: {
      模式: 浏览器测试模式
      服务地址: string | undefined
      开始时间: string
      耗时毫秒: number
      通过数: number
      失败数: number
      记录们: readonly 执行结果[]
      基础设施错误们: readonly string[]
      中断码: number | undefined
    },
  ): Promise<void> {
    let 文件们 = await readdir(报告目录)
    let 日志链接 = [
      { 文件: 'server.stdout.log', 名称: '服务标准输出' },
      { 文件: 'server.stderr.log', 名称: '服务错误输出' },
    ]
      .filter(({ 文件 }) => 文件们.includes(文件))
      .map(({ 文件, 名称 }) => `<a href="${文件}">${名称}</a>`)
      .join(' · ')
    let 错误Html = (错误们: readonly string[]): string =>
      错误们.map((错误) => `<pre>${this.转义Html(错误)}</pre>`).join('')
    let 用例Html = 报告.记录们
      .map((记录) => {
        let 附件Html = 记录.附件们
          .map((附件) => {
            let 地址 = 附件.相对路径.split('/').map(encodeURIComponent).join('/')
            let 新标签页 = 附件.内容类型.startsWith('image/') ? ' target="_blank" rel="noopener"' : ''
            return `<li><a href="${this.转义Html(地址)}"${新标签页}>${this.转义Html(附件.名称)}</a></li>`
          })
          .join('')
        return `<details ${记录.状态 === '失败' ? 'open' : ''}><summary>${记录.状态} · ${this.转义Html(记录.名称)} · 第 ${String(记录.尝试序号)} 次 · ${String(记录.耗时毫秒)}ms</summary>
        <p>${this.转义Html(记录.文件)}</p>${错误Html(记录.错误们)}<ul>${附件Html}</ul></details>`
      })
      .join('')
    let html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>端到端测试报告</title><style>:root{color-scheme:light dark}body{font:16px/1.5 system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem}details{border:1px solid #888;padding:.75rem;margin:1rem 0}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head>
    <body><h1>端到端测试报告</h1><p>${报告.开始时间} · ${报告.模式}模式 · ${String(报告.耗时毫秒)}ms</p>
    <p>通过 ${String(报告.通过数)} · 失败 ${String(报告.失败数)}${报告.中断码 === undefined ? '' : ' · 已中断'}</p>
    ${报告.服务地址 === undefined ? '' : `<p>${this.转义Html(报告.服务地址)}</p>`}
    ${日志链接 === '' ? '' : `<p>${日志链接}</p>`}
    ${错误Html(报告.基础设施错误们)}${用例Html}</body></html>`
    let html路径 = path.join(报告目录, 'index.html')
    await writeFile(path.join(报告目录, 'report.json'), JSON.stringify(报告, undefined, 2), 'utf8')
    await writeFile(html路径, html, 'utf8')
    console.log(`端到端测试报告已生成：${pathToFileURL(html路径).href}`)
  }

  private 获得相对路径(目录: string, 文件: string): string {
    return path.relative(目录, 文件).replaceAll('\\', '/')
  }

  private 错误文本(错误: unknown): string {
    return stripVTControlCharacters(inspect(错误))
  }

  private 转义Html(文本: string): string {
    return 文本.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  }
}

let 入口文件 = process.argv[1]
if (入口文件 !== undefined && pathToFileURL(path.resolve(入口文件)).href === import.meta.url) {
  try {
    let 根目录 = path.resolve(import.meta.dirname, '../../../')
    process.exitCode = await new 端到端测试运行器(根目录).运行(process.argv.slice(2))
  } catch (错误) {
    console.error(错误)
    process.exitCode = 1
  } finally {
    await 全局资源.关闭()
  }
}
