import crossSpawn from 'cross-spawn'
import * as path from 'path'
import { pathToFileURL } from 'url'

type 测试选项 = { 过滤器?: string; 生成覆盖率?: boolean; 全部?: boolean; 自动打开?: boolean }

/**
 * 单元测试运行器负责在指定项目中生成并执行接口单元测试。
 * 它记录项目位置和覆盖率报告目录，统一管理运行参数与测试生成配置。
 * 可以通过它执行测试，并在启用覆盖率时输出或打开报告。
 */
class 单元测试运行器 {
  private readonly 根目录: string
  private readonly 报告目录: string

  public constructor(根目录: string) {
    if (path.isAbsolute(根目录) === false) throw new Error('单元测试项目根目录必须是绝对路径')
    this.根目录 = 根目录
    this.报告目录 = path.join(根目录, 'test-outputs/coverage')
  }

  private 解析参数(参数组: readonly string[]): 测试选项 {
    let 结果: 测试选项 = {}
    for (let 索引 = 0; 索引 < 参数组.length; 索引 += 1) {
      let 原始参数 = 参数组[索引]
      if (原始参数 === undefined) continue

      if (原始参数 === '--all') {
        结果.全部 = true
        结果.过滤器 ??= '.*'
        结果.生成覆盖率 ??= true
        continue
      }

      if (原始参数 === '--filter') {
        let 过滤器 = 参数组[索引 + 1]
        if (过滤器 === undefined || 过滤器.startsWith('--') === true) throw new Error('--filter 后必须提供正则表达式')
        结果.过滤器 = 过滤器
        索引 += 1
        continue
      }

      if (原始参数.startsWith('--filter=') === true) {
        结果.过滤器 = 原始参数.slice('--filter='.length)
        continue
      }

      if (原始参数 === '--coverage') {
        结果.生成覆盖率 = true
        continue
      }

      if (原始参数 === '--no-coverage') {
        结果.生成覆盖率 = false
        continue
      }

      if (原始参数 === '--open') {
        结果.自动打开 = true
        continue
      }

      // 未指定过滤器且非 -- 开头时，作为接口路径过滤正则
      if (原始参数.startsWith('--') === false && 结果.过滤器 === undefined) {
        结果.过滤器 = 原始参数
        continue
      }

      throw new Error(`未知参数: ${原始参数}，支持的参数: --all, --filter <正则>, --coverage, --no-coverage, --open`)
    }
    return 结果
  }

  private 执行命令(程序: string, 参数组: string[]): void {
    let 结果 = crossSpawn.sync(程序, 参数组, {
      cwd: this.根目录,
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    if (结果.error instanceof Error) throw 结果.error
    if (结果.status !== 0) throw new Error(`命令 ${程序} 执行失败，退出码: ${String(结果.status)}`)
  }

  public 运行(参数组: readonly string[]): void {
    let 选项 = this.解析参数(参数组)
    选项.过滤器 ??= '.*'

    // 默认行为即生成覆盖率报告
    选项.生成覆盖率 ??= true

    let 实际过滤器 = 选项.过滤器.trim() === '' ? '.*' : 选项.过滤器.trim()

    console.log(`\n==========================================`)
    console.log(`🚀 开始执行单元测试 (过滤器: ${实际过滤器}, 生成覆盖率: ${String(选项.生成覆盖率)})`)
    console.log(`==========================================\n`)

    try {
      this.执行命令('lsby-net-core-gen-test', this.获得单元测试生成参数(实际过滤器))
      this.执行命令('vitest', 选项.生成覆盖率 === true ? ['run', '--coverage'] : ['run'])

      if (选项.生成覆盖率 === true) {
        let 报告文件 = path.join(this.报告目录, 'index.html')
        let 报告链接 = pathToFileURL(报告文件).href
        console.log(`\n==========================================`)
        console.log(`📊 单元测试覆盖率报告已生成: ${报告链接}`)
        console.log(`==========================================\n`)

        if (选项.自动打开 === true) {
          this.执行命令('open-cli', [报告文件])
        }
      }
    } catch (错误) {
      console.error(`\n❌ 测试执行失败 : ${String(错误)}`)
      process.exit(1)
    }

    console.log(`\n✅ 单元测试执行成功！`)
  }

  private 获得单元测试生成参数(过滤器: string): string[] {
    return ['./tsconfig.json', './src', './test/unit/unit-test.test.ts', 过滤器]
  }
}

try {
  let 根目录 = path.resolve(import.meta.dirname, '../../../')
  new 单元测试运行器(根目录).运行(process.argv.slice(2))
} catch (错误) {
  console.error(`\n💥 发生未处理的错误:`, 错误)
  process.exitCode = 1
}
