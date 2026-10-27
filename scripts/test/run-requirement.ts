import crossSpawn from 'cross-spawn'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { 加载需求测试选择数据 } from './requirement-selection'
import type { 筛选目标 } from './requirement-selector-renderer'

function 转义正则(值: string): string {
  return 值.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function 主函数(): Promise<void> {
  let 根目录 = path.resolve(import.meta.dirname, '../../')
  let 需求目录 = path.join(根目录, 'test/requirement')
  let { 流程列表 } = await 加载需求测试选择数据(需求目录)

  let 命令行参数 = process.argv.slice(2)
  let 全部运行 = false
  let 指定流程名称列表: string[] = []
  let 指定需求名称: string | undefined
  let 指定模式: 'auto' | 'demo' | undefined
  let 指定跳过人工验收: boolean | undefined
  let 传递给执行器的参数: string[] = []

  for (let 索引 = 0; 索引 < 命令行参数.length; 索引 += 1) {
    let 参数 = 命令行参数[索引]
    if (参数 === undefined) continue
    if (参数 === '--all') {
      全部运行 = true
      continue
    }
    if (参数 === '--demo') {
      指定模式 = 'demo'
      continue
    }
    if (参数 === '--auto') {
      指定模式 = 'auto'
      continue
    }
    if (参数 === '--skip-manual') {
      指定跳过人工验收 = true
      continue
    }
    if (参数 === '--no-skip-manual') {
      指定跳过人工验收 = false
      continue
    }
    if (参数 === '--mode') {
      let 模式值 = 命令行参数[索引 + 1]
      if (模式值 === 'auto' || 模式值 === 'demo') {
        指定模式 = 模式值
        索引 += 1
      }
      continue
    }
    if (参数.startsWith('--scenario=')) {
      指定流程名称列表.push(参数.slice('--scenario='.length).trim())
    } else if (参数 === '--scenario') {
      let 流程名称 = 命令行参数[索引 + 1]?.trim()
      if (流程名称 !== undefined) 指定流程名称列表.push(流程名称)
      索引 += 1
    } else if (参数.startsWith('--requirement=')) {
      指定需求名称 = 参数.slice('--requirement='.length).trim()
    } else if (参数 === '--requirement') {
      指定需求名称 = 命令行参数[索引 + 1]?.trim()
      索引 += 1
    } else {
      传递给执行器的参数.push(参数)
    }
  }

  let 目标: 筛选目标
  if (全部运行 === true) {
    目标 = { 类型: '全部', 流程列表 }
  } else if (指定流程名称列表.length > 0) {
    let 找到的流程列表 = 指定流程名称列表.map((流程名称) => {
      let 找到的流程 = 流程列表.find((项) => 项.流程名称 === 流程名称)
      if (找到的流程 === undefined) throw new Error(`找不到指定的流程场景: ${流程名称}`)
      return 找到的流程
    })
    目标 =
      找到的流程列表.length === 1 && 找到的流程列表[0] !== undefined
        ? { 类型: '单流程', 流程: 找到的流程列表[0].流程 }
        : { 类型: '全部', 流程列表: 找到的流程列表 }
  } else if (指定需求名称 !== undefined && 指定需求名称 !== '') {
    let 匹配的流程们 = 流程列表.filter((项) => 项.所属需求名称们.includes(指定需求名称))
    if (匹配的流程们.length === 0) throw new Error(`找不到包含需求“${指定需求名称}”的测试流程`)
    目标 = { 类型: '全部', 流程列表: 匹配的流程们 }
  } else 目标 = { 类型: '全部', 流程列表 }

  let 演示模式: boolean
  if (指定模式 !== undefined) {
    演示模式 = 指定模式 === 'demo'
  } else 演示模式 = false

  let 人工流程名称列表: string[]
  switch (目标.类型) {
    case '单流程':
      人工流程名称列表 = 目标.流程.覆盖验收点们.some((验收点) => 验收点.验收手段 === '人工') ? [目标.流程.名称] : []
      break
    case '全部':
      人工流程名称列表 = 目标.流程列表.filter((流程项) => 流程项.包含人工验收).map((流程项) => 流程项.流程名称)
      break
  }
  let 跳过人工验收: boolean
  if (指定跳过人工验收 !== undefined) {
    跳过人工验收 = 指定跳过人工验收
  } else 跳过人工验收 = 演示模式 === false
  if (跳过人工验收 === true && 人工流程名称列表.length > 0) {
    console.log(`\n已跳过 ${String(人工流程名称列表.length)} 个需人工验收的流程：${人工流程名称列表.join('、')}`)
    switch (目标.类型) {
      case '单流程':
        console.log('没有剩余的自动验收流程可执行。')
        return
      case '全部':
        目标 = { 类型: '全部', 流程列表: 目标.流程列表.filter((流程项) => 流程项.包含人工验收 === false) }
        break
    }
  }

  let grep参数: string[] = []
  if (目标.类型 === '单流程') {
    console.log(`\n🎯 选中执行单一流程: ${目标.流程.名称}`)
    grep参数 = ['--grep', 转义正则(目标.流程.名称)]
  } else {
    if (目标.流程列表.length === 0) {
      console.log('\n⚠️ 当前筛选条件下没有任何流程可执行')
      return
    }
    if (目标.流程列表.length === 流程列表.length) {
      console.log(`\n🚀 全量执行所有测试流程 (${目标.流程列表.length} 个流程)`)
    } else {
      let 流程名正则 = 目标.流程列表.map((项) => 转义正则(项.流程名称)).join('|')
      console.log(`\n🚀 执行筛选后的 ${目标.流程列表.length} 个测试流程:`)
      for (let 项 of 目标.流程列表) console.log(`   - ${项.流程名称}`)
      grep参数 = ['--grep', 流程名正则]
    }
  }

  let 模式附加参数: string[] = []
  if (演示模式 === true) {
    模式附加参数.push('--headed')
  }

  let 完整参数 = [
    'test',
    '--config',
    'playwright.requirement.config.ts',
    ...grep参数,
    ...模式附加参数,
    ...传递给执行器的参数,
  ]

  console.log(`🚀 执行命令: playwright ${完整参数.join(' ')}\n`)

  let 环境变量 = { ...process.env }
  环境变量['DEMO_MODE'] = 演示模式 === true ? 'true' : 'false'

  let 子进程 = crossSpawn('playwright', 完整参数, {
    cwd: 根目录,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: 环境变量,
  })

  await new Promise<void>((完成, 失败) => {
    子进程.on('error', 失败)
    子进程.on('close', (退出码) => {
      let 报告文件 = path.join(根目录, 'test-outputs/requirement-report/index.html')
      if (fsSync.existsSync(报告文件) === true) {
        let 报告链接 = pathToFileURL(报告文件).href
        console.log(`\n==========================================`)
        console.log(`📊 业务需求测试报告已生成: ${报告链接}`)
        console.log(`==========================================\n`)
      }
      if (退出码 === 0) 完成()
      else 失败(new Error(`测试流程执行结束，退出码: ${String(退出码)}`))
    })
  })
}

主函数().catch((错误: unknown) => {
  if (错误 instanceof Error && (错误.name === 'ExitPromptError' || 错误.message.includes('force closed the prompt'))) {
    process.exit(0)
  }
  console.error('\n💥 发生未处理的错误:', 错误)
  process.exit(1)
})
