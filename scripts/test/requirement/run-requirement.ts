import * as fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'

import { z } from 'zod'

import { 需求测试, type 需求, type 需求测试流程, type 需求测试附件 } from '../../../src/model/test-requirement'
import { 测试服务 } from '../test-server'
import { 保存需求测试报告, type 需求测试记录, type 需求测试附件记录 } from './report'

type 需求测试实例 = Pick<需求测试<object>, '获得需求们' | '获得流程们' | '运行'>
type 需求测试入口 = { 实例: 需求测试实例; 流程: 需求测试流程; 需求们: readonly 需求[] }
type 需求测试运行选项 = { 全部运行: boolean; 指定流程名称们: readonly string[]; 指定需求名称: string | undefined }

/**
 * 需求测试运行器负责在一个项目中发现、调用和汇总需求测试入口。
 * 它记录测试与报告目录，并管理测试服务进程、运行选项和附件输出。
 * 可以通过它检查测试登记关系、执行选定流程并保存报告，流程内部的资源仍由测试入口自行管理。
 */
export class 需求测试运行器 {
  private readonly 根目录: string
  private readonly 需求目录: string
  private readonly 报告目录: string
  private 正在处理信号 = false
  private 运行中 = false

  private readonly 入口Schema = z.object({
    default: z.custom<new () => 需求测试实例>(
      (值) => typeof 值 === 'function' && 值.prototype instanceof 需求测试,
      '测试入口必须默认导出需求测试子类',
    ),
  })
  public constructor(根目录: string) {
    if (path.isAbsolute(根目录) === false) throw new Error('需求测试项目根目录必须是绝对路径')
    this.根目录 = 根目录
    this.需求目录 = path.join(根目录, 'test/requirement')
    this.报告目录 = path.join(根目录, 'test-outputs/requirement-report')
  }

  public async 发现测试(): Promise<readonly 需求测试入口[]> {
    let 文件们 = (await fs.promises.readdir(this.需求目录, { withFileTypes: true }))
      .filter((项) => 项.isFile() && 项.name.endsWith('.ts'))
      .map((项) => 项.name)
      .sort()
    let 实例们: 需求测试实例[] = []
    for (let 文件 of 文件们) {
      let 入口 = this.入口Schema.safeParse(await import(pathToFileURL(path.join(this.需求目录, 文件)).href))
      if (入口.success === false)
        throw new Error(`需求测试文件“${文件}”未默认导出有效的测试子类`, { cause: 入口.error })
      实例们.push(new 入口.data.default())
    }
    let 需求们 = 实例们.flatMap((实例) => 实例.获得需求们())
    let 测试们 = 实例们.flatMap((实例) => 实例.获得流程们().map((流程) => ({ 实例, 流程 })))
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

  public async 运行(参数们: readonly string[]): Promise<void> {
    if (this.运行中) throw new Error('同一需求测试运行器不能同时执行多次运行')
    this.运行中 = true
    this.正在处理信号 = false
    try {
      await this.执行流程们(参数们)
    } finally {
      this.运行中 = false
    }
  }

  private async 执行流程们(参数们: readonly string[]): Promise<void> {
    let 服务 = new 测试服务(this.根目录, 'test:requirement:server', this.报告目录)
    let 服务地址 = 服务.获得服务地址()
    let 流程们 = await this.发现测试()
    let 选中流程们 = this.选择流程(流程们, this.解析运行选项(参数们))
    if (选中流程们.length === 0) {
      console.log('没有需要执行的需求测试流程。')
      this.输出需求测试报告(服务地址, Date.now(), 流程们, [], undefined)
      return
    }
    console.log(
      `将执行 ${String(选中流程们.length)} 个需求流程：${选中流程们.map((项) => 项.流程.获得名称()).join('、')}`,
    )
    let 开始时间 = Date.now()
    let 记录们: 需求测试记录[] = []
    let 基础设施错误: string | undefined
    let 处理SIGINT = (): void => this.处理中断(服务, 130)
    let 处理SIGTERM = (): void => this.处理中断(服务, 143)
    process.on('SIGINT', 处理SIGINT)
    process.on('SIGTERM', 处理SIGTERM)
    try {
      服务地址 = await 服务.启动()
      for (let [流程序号, 测试] of 选中流程们.entries()) {
        let 名称 = 测试.流程.获得名称()
        let 安全名称 = 名称.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '')
        let 附件目录 = path.join(this.报告目录, 'artifacts', `${String(流程序号 + 1).padStart(2, '0')}-${安全名称}`)
        console.log(`\n开始需求流程：${名称}`)
        let 结果 = await 测试.实例.运行(名称, { 服务地址, 附件目录, 流程序号 })
        记录们.push({ 测试, 结果, 附件们: this.规范化附件们(结果.附件们) })
        console.log(`${名称}：${结果.状态}（${String(结果.耗时毫秒)}ms）`)
      }
    } catch (错误) {
      基础设施错误 = this.格式化错误(错误)
    } finally {
      process.off('SIGINT', 处理SIGINT)
      process.off('SIGTERM', 处理SIGTERM)
      try {
        await 服务.关闭()
      } catch (错误) {
        基础设施错误 = [基础设施错误, this.格式化错误(错误)].filter((值) => 值 !== undefined).join('\n')
      }
    }
    this.输出需求测试报告(服务地址, 开始时间, 流程们, 记录们, 基础设施错误)
  }

  private 输出需求测试报告(
    服务地址: string,
    开始时间: number,
    流程们: readonly 需求测试入口[],
    记录们: readonly 需求测试记录[],
    基础设施错误: string | undefined,
  ): void {
    let 产物 = 保存需求测试报告(this.报告目录, {
      服务地址,
      开始时间,
      结束时间: Date.now(),
      流程们,
      记录们,
      基础设施错误,
    })
    console.log(`需求测试报告已生成：${pathToFileURL(产物.html路径).href}`)
    if (产物.全部通过 === false) throw new Error('需求测试未全部通过，请查看需求测试报告')
  }

  private 处理中断(服务: 测试服务, 退出码: number): void {
    if (this.正在处理信号) return
    this.正在处理信号 = true
    void 服务
      .关闭()
      .catch((错误: unknown): void => console.error(错误))
      .finally((): void => process.exit(退出码))
  }

  private 解析运行选项(参数们: readonly string[]): 需求测试运行选项 {
    let 全部运行 = false
    let 指定流程名称们: string[] = []
    let 指定需求名称: string | undefined
    for (let 索引 = 0; 索引 < 参数们.length; 索引 += 1) {
      let 参数 = 参数们[索引]
      if (参数 === undefined) throw new Error(`需求测试参数索引越界：${String(索引)}`)
      if (参数 === '--all') 全部运行 = true
      else if (参数.startsWith('--scenario=')) 指定流程名称们.push(参数.slice('--scenario='.length).trim())
      else if (参数 === '--scenario') {
        let 流程名称 = 参数们[索引 + 1]?.trim()
        if (流程名称 === undefined || 流程名称 === '') throw new Error('--scenario 后必须提供流程名称')
        指定流程名称们.push(流程名称)
        索引 += 1
      } else if (参数.startsWith('--requirement=')) 指定需求名称 = 参数.slice('--requirement='.length).trim()
      else if (参数 === '--requirement') {
        指定需求名称 = 参数们[索引 + 1]?.trim()
        if (指定需求名称 === undefined || 指定需求名称 === '') throw new Error('--requirement 后必须提供需求名称')
        索引 += 1
      } else throw new Error(`未知的需求测试参数：${参数}`)
    }
    return { 全部运行, 指定流程名称们, 指定需求名称 }
  }

  private 选择流程(流程们: readonly 需求测试入口[], 选项: 需求测试运行选项): readonly 需求测试入口[] {
    let 结果: readonly 需求测试入口[]
    if (选项.全部运行) 结果 = 流程们
    else if (选项.指定流程名称们.length > 0)
      结果 = 选项.指定流程名称们.map((名称) => {
        let 流程项 = 流程们.find((候选) => 候选.流程.获得名称() === 名称)
        if (流程项 === undefined) throw new Error(`找不到指定的流程场景：${名称}`)
        return 流程项
      })
    else if (选项.指定需求名称 !== undefined) {
      let 需求名称 = 选项.指定需求名称
      结果 = 流程们.filter((流程项) => 流程项.需求们.some((值) => 值.获得名称() === 需求名称))
      if (结果.length === 0) throw new Error(`找不到包含需求“${需求名称}”的测试流程`)
    } else 结果 = 流程们
    let 人工流程们 = 结果.filter((流程项) => 流程项.流程.包含人工验收())
    if (人工流程们.length > 0)
      console.log(
        `已跳过 ${String(人工流程们.length)} 个需人工验收的流程：${人工流程们.map((流程项) => 流程项.流程.获得名称()).join('、')}`,
      )
    return 结果.filter((流程项) => 流程项.流程.包含人工验收() === false)
  }

  private 格式化错误(错误: unknown): string {
    return 错误 instanceof Error ? (错误.stack ?? 错误.message) : String(错误)
  }

  private 规范化附件们(附件们: readonly 需求测试附件[]): readonly 需求测试附件记录[] {
    return 附件们.map(({ 路径, ...附件 }) => {
      let 绝对路径 = path.resolve(路径)
      let 相对路径 = path.relative(this.报告目录, 绝对路径)
      if (相对路径.startsWith('..') || path.isAbsolute(相对路径))
        throw new Error(`需求测试附件必须位于报告目录内：${路径}`)
      if (fs.existsSync(绝对路径) === false) throw new Error(`需求测试附件不存在：${路径}`)
      return { ...附件, 相对路径: 相对路径.replaceAll('\\', '/') }
    })
  }
}

let 入口文件 = process.argv[1]
if (入口文件 !== undefined && pathToFileURL(path.resolve(入口文件)).href === import.meta.url) {
  try {
    let 根目录 = path.resolve(import.meta.dirname, '../../../')
    await new 需求测试运行器(根目录).运行(process.argv.slice(2))
    process.exit(0)
  } catch (错误) {
    console.error(错误 instanceof Error ? (错误.stack ?? 错误.message) : String(错误))
    process.exit(1)
  }
}
