import { mkdir, mkdtemp, readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspect, parseArgs, stripVTControlCharacters } from 'node:util'
import { z } from 'zod'

import { 全局资源 } from '../../../src/global/global'
import type { 浏览器测试模式 } from '../../../src/model/browser-test'
import { 端到端测试 } from '../../../src/model/test-e2e'
import { 测试服务 } from '../test-server'
import { 执行端到端测试尝试, type 执行结果, type 端到端测试登记 } from './attempt'
import { 保存端到端测试报告 } from './report'

type 端到端测试选项 = { 目标们: readonly string[]; 模式: 浏览器测试模式 | undefined; 仅列出: boolean }

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
          let 结果 = await 执行端到端测试尝试(测试, {
            根目录: this.根目录,
            服务地址,
            模式,
            尝试序号,
            本次报告目录,
            取消信号: 取消控制器.signal,
          })
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
    let html路径 = await 保存端到端测试报告(本次报告目录, {
      模式,
      服务地址,
      开始时间: new Date(开始时间).toISOString(),
      耗时毫秒: Date.now() - 开始时间,
      通过数: 最终结果们.filter((记录) => 记录.状态 === '通过').length,
      失败数,
      用例们: 测试们.map(({ 文件, 类 }) => ({ 文件, 名称: 类.name })),
      记录们,
      基础设施错误们,
      中断码,
    })
    console.log(`端到端测试报告已生成：${pathToFileURL(html路径).href}`)
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

  private 获得相对路径(目录: string, 文件: string): string {
    return path.relative(目录, 文件).replaceAll('\\', '/')
  }

  private 错误文本(错误: unknown): string {
    return stripVTControlCharacters(inspect(错误))
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
