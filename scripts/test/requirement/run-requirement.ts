import { mkdir, mkdtemp, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { z } from 'zod'

import type { 浏览器测试模式 } from '../../../src/model/browser-test'
import { 需求测试, type 需求, type 需求测试流程 } from '../../../src/model/test-requirement'
import { 测试服务 } from '../test-server'
import { 格式化需求测试错误 } from './format-error'
import { 保存需求测试报告, type 需求测试尝试记录, type 需求测试附件记录 } from './report'

type 需求测试实例 = Pick<需求测试, '获得需求们' | '获得流程们' | '需要测试服务' | '运行'>
type 需求测试入口 = { 实例: 需求测试实例; 文件: string; 流程: 需求测试流程; 需求们: readonly 需求[] }
type 需求测试运行选项 = {
  全部运行: boolean
  指定流程名称们: readonly string[]
  指定需求名称: string | undefined
  模式: 浏览器测试模式
  仅列出: boolean
}
type 尝试参数 = {
  模式: 浏览器测试模式
  服务: 测试服务 | undefined
  报告目录: string
  附件目录: string
  取消信号: AbortSignal
}

/**
 * 需求测试运行器发现需求与流程，按选择执行，管理测试服务并保存报告。
 */
export class 需求测试运行器 {
  private readonly 需求目录: string
  private readonly 报告目录: string
  private 运行中 = false

  private readonly 入口Schema = z.object({
    default: z.custom<new () => 需求测试实例>(
      (值) => typeof 值 === 'function' && 值.prototype instanceof 需求测试,
      '测试入口必须默认导出需求测试子类',
    ),
  })

  public constructor(private readonly 根目录: string) {
    if (path.isAbsolute(根目录) === false) throw new Error('需求测试项目根目录必须是绝对路径')
    this.需求目录 = path.join(根目录, 'test/requirement')
    this.报告目录 = path.join(根目录, 'test-outputs/requirement-report')
  }

  public async 发现测试(): Promise<readonly 需求测试入口[]> {
    let 文件们 = (await readdir(this.需求目录, { recursive: true, withFileTypes: true }))
      .filter((项) => 项.isFile() && 项.name.endsWith('.ts'))
      .map((项) => path.relative(this.需求目录, path.join(项.parentPath, 项.name)).replaceAll('\\', '/'))
      .filter((文件) => 文件.startsWith('helper/') === false)
      .sort()
    let 登记们: { 文件: string; 实例: 需求测试实例 }[] = []
    for (let 文件 of 文件们) {
      let 入口 = this.入口Schema.safeParse(await import(pathToFileURL(path.join(this.需求目录, 文件)).href))
      if (入口.success === false)
        throw new Error(`需求测试文件“${文件}”未默认导出有效的测试子类`, { cause: 入口.error })
      登记们.push({ 文件, 实例: new 入口.data.default() })
    }
    let 需求们 = 登记们.flatMap(({ 实例 }) => 实例.获得需求们())
    let 测试们 = 登记们.flatMap((登记) => 登记.实例.获得流程们().map((流程) => ({ ...登记, 流程 })))
    if (new Set(需求们.map((值) => 值.获得名称())).size !== 需求们.length) throw new Error('需求测试包含重复需求名称')
    if (new Set(测试们.map((测试) => 测试.流程.获得名称())).size !== 测试们.length)
      throw new Error('需求测试包含重复流程名称')
    let 验收点们 = 需求们.flatMap((值) => [...值.获得验收点们()])
    if (new Set(验收点们).size !== 验收点们.length) throw new Error('验收点被多个需求引用')
    for (let 测试 of 测试们)
      for (let 验收点值 of 测试.流程.获得覆盖验收点们())
        if (验收点们.includes(验收点值) === false) throw new Error(`流程“${测试.流程.获得名称()}”引用了未登记验收点`)
    let 已覆盖 = 测试们.flatMap((测试) => [...测试.流程.获得覆盖验收点们()])
    for (let 值 of 需求们) 值.检查覆盖(已覆盖)
    return 测试们.map((测试) => ({
      ...测试,
      需求们: 需求们.filter((值) => 测试.流程.获得覆盖验收点们().some((点) => 值.包含(点))),
    }))
  }

  public async 运行(参数们: readonly string[]): Promise<number> {
    if (this.运行中) throw new Error('同一需求测试运行器不能同时执行多次运行')
    this.运行中 = true
    try {
      return await this.执行流程们(参数们)
    } finally {
      this.运行中 = false
    }
  }

  private async 执行流程们(参数们: readonly string[]): Promise<number> {
    let 选项 = this.解析运行选项(参数们)
    let 流程们 = await this.发现测试()
    let 选中流程们 = this.选择流程(流程们, 选项)
    if (选项.仅列出) {
      for (let { 文件, 流程 } of 选中流程们) {
        let 类型 = 流程.包含人工验收() ? '人工验收' : '自动执行'
        console.log(`${流程.获得名称()} · ${类型} · ${文件}`)
      }
      return 0
    }
    let 自动流程们 = 选中流程们.filter(({ 流程 }) => 流程.包含人工验收() === false)
    let 人工流程们 = 选中流程们.filter(({ 流程 }) => 流程.包含人工验收())
    if (人工流程们.length > 0)
      console.log(
        `已跳过 ${String(人工流程们.length)} 个需人工验收的流程：${人工流程们.map(({ 流程 }) => 流程.获得名称()).join('、')}`,
      )
    console.log(
      `将执行 ${String(自动流程们.length)} 个需求流程：${自动流程们.map(({ 流程 }) => 流程.获得名称()).join('、')}`,
    )

    let 开始时间 = Date.now()
    await mkdir(this.报告目录, { recursive: true })
    let 报告目录 = await mkdtemp(path.join(this.报告目录, `${String(开始时间)}-`))
    let 服务: 测试服务 | undefined
    let 服务地址: string | undefined
    let 基础设施错误们: string[] = []
    let 记录们 = 自动流程们.map((测试) => ({ 测试, 尝试们: new Array<需求测试尝试记录>() }))
    let 取消控制器 = new AbortController()
    let 取消信号 = 取消控制器.signal
    let 已取消 = (): boolean => 取消信号.aborted
    let 中断码: number | undefined
    let 记录错误 = (错误: unknown): void => {
      基础设施错误们.push(错误 instanceof Error ? (错误.stack ?? 错误.message) : String(错误))
    }
    let 处理中断 = (退出码: number): void => {
      if (中断码 !== undefined) return
      中断码 = 退出码
      取消控制器.abort(new Error('需求测试已中断'))
      // 启动中的服务需要提前关闭，关闭错误由 finally 中的同一个关闭任务处理。
      if (服务地址 === undefined && 服务 !== undefined) void 服务.关闭().catch((): void => {})
    }
    let 处理SIGINT = (): void => 处理中断(130)
    let 处理SIGTERM = (): void => 处理中断(143)
    process.on('SIGINT', 处理SIGINT)
    process.on('SIGTERM', 处理SIGTERM)
    try {
      let 最大尝试次数 = 选项.模式 === '自动' && process.env['CI'] !== undefined && process.env['CI'] !== '' ? 3 : 1
      for (let [流程索引, { 测试, 尝试们 }] of 记录们.entries()) {
        if (已取消()) break
        let 需要服务 = 测试.实例.需要测试服务()
        if (需要服务 && 服务 === undefined) {
          服务 = new 测试服务(this.根目录, 报告目录)
          try {
            服务地址 = await 服务.启动()
          } catch (错误) {
            if (已取消() === false) 记录错误(错误)
          }
        }
        if (需要服务 && 服务地址 === undefined) continue
        for (let 尝试序号 = 1; 尝试序号 <= 最大尝试次数 && 已取消() === false; 尝试序号 += 1) {
          let 附件目录 = path.join(报告目录, 'artifacts', String(流程索引 + 1), String(尝试序号))
          let 名称 = 测试.流程.获得名称()
          console.log(`\n开始需求流程：${名称}（第 ${String(尝试序号)} 次）`)
          let 尝试 = await this.执行尝试(测试, 尝试序号, {
            模式: 选项.模式,
            服务: 需要服务 ? 服务 : undefined,
            报告目录,
            附件目录,
            取消信号,
          })
          尝试们.push(尝试)
          console.log(`${名称}：${尝试.结果.状态}（${String(尝试.结果.耗时毫秒)}ms）`)
          if (尝试.结果.错误 !== undefined) console.error(尝试.结果.错误.文本)
          for (let 错误 of 尝试.附件错误们) console.error(错误.文本)
          for (let 错误 of 尝试.清理错误们) console.error(错误.文本)
          if (尝试.结果.状态 !== '失败') break
        }
      }
    } catch (错误) {
      记录错误(错误)
    } finally {
      try {
        await 服务?.关闭()
      } catch (错误) {
        记录错误(错误)
      } finally {
        process.off('SIGINT', 处理SIGINT)
        process.off('SIGTERM', 处理SIGTERM)
      }
    }
    let 产物 = 保存需求测试报告(报告目录, {
      模式: 选项.模式,
      服务地址,
      开始时间,
      结束时间: Date.now(),
      流程们,
      选中流程们,
      记录们,
      基础设施错误们,
      中断码,
    })
    console.log(`需求测试报告已生成：${pathToFileURL(产物.html路径).href}`)
    return 中断码 ?? (产物.全部通过 ? 0 : 1)
  }

  private async 执行尝试(测试: 需求测试入口, 尝试序号: number, 参数: 尝试参数): Promise<需求测试尝试记录> {
    let { 需求测试运行工具 } = await import('./runtime')
    let 工具 = new 需求测试运行工具(参数)
    let 格式化错误 = (错误: unknown): ReturnType<typeof 格式化需求测试错误> =>
      格式化需求测试错误(错误, path.join(this.需求目录, 测试.文件))
    let 附件们: 需求测试附件记录[] = []
    let 附件错误们: ReturnType<typeof 格式化需求测试错误>[] = []
    let 清理错误们: ReturnType<typeof 格式化需求测试错误>[] = []
    let 记录附件错误 = (错误: unknown): void => {
      附件错误们.push(格式化错误(错误))
    }
    let 结果: Awaited<ReturnType<需求测试实例['运行']>>
    try {
      结果 = await 测试.实例.运行(测试.流程.获得名称(), {
        工具: 工具.工具,
        取消信号: 参数.取消信号,
        执行步骤: (提交, 记录错误, 执行) => 工具.执行步骤(提交, 记录错误, 执行),
        格式化错误,
      })
      try {
        for (let { 路径, ...附件 } of await 工具.收集附件(记录附件错误)) {
          try {
            let 相对路径 = path.relative(参数.报告目录, 路径)
            if (相对路径 === '..' || 相对路径.startsWith(`..${path.sep}`) || path.isAbsolute(相对路径))
              throw new Error(`需求测试附件必须位于报告目录内：${路径}`)
            if ((await stat(路径)).isFile() === false) throw new Error(`需求测试附件必须是文件：${路径}`)
            附件们.push({ ...附件, 相对路径: 相对路径.replaceAll('\\', '/') })
          } catch (错误) {
            记录附件错误(错误)
          }
        }
      } catch (错误) {
        记录附件错误(错误)
      }
    } finally {
      try {
        await 工具.关闭()
      } catch (错误) {
        清理错误们.push(格式化错误(错误))
      }
    }
    let 状态 = 参数.取消信号.aborted ? '中断' : 清理错误们.length > 0 ? '失败' : 结果.状态
    return {
      尝试序号,
      结果: { ...结果, 状态, 证明验收点们: 状态 === '通过' ? 结果.证明验收点们 : [] },
      附件们,
      附件错误们,
      清理错误们,
    }
  }

  private 解析运行选项(参数们: readonly string[]): 需求测试运行选项 {
    let { values } = parseArgs({
      args: [...参数们],
      options: {
        all: { type: 'boolean' },
        scenario: { type: 'string', multiple: true },
        requirement: { type: 'string' },
        list: { type: 'boolean' },
        auto: { type: 'boolean' },
        demo: { type: 'boolean' },
        mode: { type: 'string' },
      },
    })
    if (values.mode !== undefined && values.mode !== 'auto' && values.mode !== 'demo')
      throw new Error('--mode 后必须提供 auto 或 demo')
    let 自动模式 = values.auto === true || values.mode === 'auto'
    let 演示模式 = values.demo === true || values.mode === 'demo'
    if (自动模式 && 演示模式) throw new Error('不能同时选择自动与演示模式')
    let 指定流程名称们 = [...new Set((values.scenario ?? []).map((名称) => 名称.trim()))]
    let 指定需求名称 = values.requirement?.trim()
    if (指定流程名称们.includes('')) throw new Error('--scenario 后必须提供流程名称')
    if (指定需求名称 === '') throw new Error('--requirement 后必须提供需求名称')
    let 全部运行 = values.all === true
    if ([全部运行, 指定流程名称们.length > 0, 指定需求名称 !== undefined].filter(Boolean).length > 1)
      throw new Error('--all、--scenario、--requirement 只能选择一种')
    return { 全部运行, 指定流程名称们, 指定需求名称, 模式: 演示模式 ? '演示' : '自动', 仅列出: values.list === true }
  }

  private 选择流程(流程们: readonly 需求测试入口[], 选项: 需求测试运行选项): readonly 需求测试入口[] {
    if (选项.全部运行) return 流程们
    if (选项.指定流程名称们.length > 0)
      return 选项.指定流程名称们.map((名称) => {
        let 流程项 = 流程们.find((候选) => 候选.流程.获得名称() === 名称)
        if (流程项 === undefined) throw new Error(`找不到指定的流程场景：${名称}`)
        return 流程项
      })
    let 需求名称 = 选项.指定需求名称
    if (需求名称 === undefined) return 流程们
    let 结果 = 流程们.filter((流程项) => 流程项.需求们.some((值) => 值.获得名称() === 需求名称))
    if (结果.length === 0) throw new Error(`找不到包含需求“${需求名称}”的测试流程`)
    return 结果
  }
}

let 入口文件 = process.argv[1]
if (入口文件 !== undefined && pathToFileURL(path.resolve(入口文件)).href === import.meta.url) {
  try {
    let 根目录 = path.resolve(import.meta.dirname, '../../../')
    process.exitCode = await new 需求测试运行器(根目录).运行(process.argv.slice(2))
  } catch (错误) {
    console.error(错误 instanceof Error ? (错误.stack ?? 错误.message) : String(错误))
    process.exitCode = 1
  }
}
