import crossSpawn from 'cross-spawn'
import inquirer from 'inquirer'
import * as fsSync from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { emitKeypressEvents } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { 测试模型 } from '../../src/model/test-requirement'
import type { 已审阅的any } from '../../src/tools/types'
import {
  从模型列表提取级联元数据,
  执行级联计算,
  type 级联维度项,
  type 级联计算结果,
} from './requirement-selector-filter'
import { 渲染通用选择器界面, type 流程展示项, type 筛选目标 } from './requirement-selector-renderer'

type 按键 = { name?: string; ctrl?: boolean }

function 转义正则(值: string): string {
  return 值.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function 是测试模型(值: unknown): 值 is 测试模型<已审阅的any, 已审阅的any> {
  if (值 instanceof 测试模型) return true
  if (typeof 值 === 'object' && 值 !== null && '元数据' in 值 && '需求们' in 值 && '流程们' in 值) {
    return true
  }
  return false
}

async function 加载所有模型(目录: string): Promise<测试模型<已审阅的any, 已审阅的any>[]> {
  let 文件列表 = await fs.readdir(目录, { recursive: true })
  let 模型文件列表 = 文件列表.filter((文件) => 文件.endsWith('-model.ts'))
  let 结果列表: 测试模型<已审阅的any, 已审阅的any>[] = []

  for (let 文件 of 模型文件列表) {
    let 文件路径 = path.join(目录, 文件)
    let 模块 = (await import(pathToFileURL(文件路径).href)) as Record<string, 已审阅的any>
    for (let 成员 of Object.values(模块)) {
      if (是测试模型(成员)) 结果列表.push(成员)
    }
  }
  return 结果列表
}

async function 交互选择测试流程(全部维度列表: 级联维度项[], 全部流程列表: 流程展示项[]): Promise<筛选目标> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    return { 类型: '全部', 流程列表: 全部流程列表 }
  }

  let 当前选择值映射 = new Map<string, string>()
  for (let 维度 of 全部维度列表) {
    let 通配选项 = 维度.原始选项们.find((项) => 项.是通配 === true) ?? 维度.原始选项们[0]
    if (通配选项 !== undefined) {
      当前选择值映射.set(维度.唯一标识, 通配选项.值)
    }
  }

  let 焦点下标 = 0
  let 搜索词 = ''
  let 正在编辑搜索 = false

  let 获得当前状态 = (): 级联计算结果 => 执行级联计算({ 全部维度列表, 全部流程列表, 当前选择值映射, 搜索词 })

  emitKeypressEvents(process.stdin)
  let 原始模式 = process.stdin.isRaw
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdout.write('\u001B[?25l')

  return await new Promise<筛选目标>((完成) => {
    let 清理 = (): void => {
      process.stdin.off('keypress', 处理按键)
      process.stdin.setRawMode(原始模式)
      process.stdin.pause()
      process.stdout.write('\u001B[2J\u001B[H\u001B[?25h')
    }

    let 渲染 = (): void => {
      let 状态 = 获得当前状态()
      渲染通用选择器界面({
        标签维度列表: 状态.保留标签维度列表,
        验收维度列表: 状态.保留验收维度列表,
        需求维度列表: 状态.保留需求维度列表,
        标签选项下标们: 状态.标签选项下标们,
        验收选项下标们: 状态.验收选项下标们,
        需求选项下标们: 状态.需求选项下标们,
        焦点下标,
        候选流程列表: 状态.候选流程列表,
        搜索词,
        正在编辑搜索,
      })
    }

    let 处理按键 = (字符: string | undefined, 按键信息: 按键): void => {
      let 状态 = 获得当前状态()
      let 筛选总行数 = 状态.保留标签维度列表.length + 状态.保留验收维度列表.length + 状态.保留需求维度列表.length
      let 方案总数 = 1 + 状态.候选流程列表.length
      let 最大焦点 = 筛选总行数 + 方案总数 - 1

      if (按键信息.ctrl === true && 按键信息.name === 'c') {
        清理()
        process.exit(0)
      }

      if (正在编辑搜索 === true) {
        if (按键信息.name === 'escape' || 按键信息.name === 'return') {
          正在编辑搜索 = false
        } else if (按键信息.name === 'backspace') {
          搜索词 = Array.from(搜索词).slice(0, -1).join('')
        } else if (字符 !== undefined && 字符 >= ' ' && 按键信息.ctrl !== true) {
          搜索词 += 字符
        }
        let 更新后状态 = 获得当前状态()
        let 更新后筛选行数 =
          更新后状态.保留标签维度列表.length + 更新后状态.保留验收维度列表.length + 更新后状态.保留需求维度列表.length
        焦点下标 = 更新后状态.候选流程列表.length === 0 ? 更新后筛选行数 : 更新后筛选行数 + 1
        渲染()
        return
      }

      if (字符 === '/') {
        正在编辑搜索 = true
        渲染()
        return
      }

      if (按键信息.name === 'escape' && 搜索词 !== '') {
        搜索词 = ''
        渲染()
        return
      }

      if (按键信息.name === 'up') {
        焦点下标 = Math.max(0, 焦点下标 - 1)
      } else if (按键信息.name === 'down') {
        焦点下标 = Math.min(最大焦点, 焦点下标 + 1)
      } else if (按键信息.name === 'left' || 按键信息.name === 'right') {
        let 方向量 = 按键信息.name === 'right' ? 1 : -1
        if (焦点下标 < 筛选总行数) {
          let 当前活跃维度 = 状态.活跃维度列表[焦点下标]
          if (当前活跃维度 !== undefined && 当前活跃维度.当前有效选项们.length > 1) {
            let 选项总数 = 当前活跃维度.当前有效选项们.length
            let 当前下标 = 当前活跃维度.当前选中下标
            let 新下标 = (当前下标 + 方向量 + 选项总数) % 选项总数
            let 新选项 = 当前活跃维度.当前有效选项们[新下标]
            if (新选项 !== undefined) {
              当前选择值映射.set(当前活跃维度.唯一标识, 新选项.值)
            }
          }
        }
      } else if (按键信息.name === 'return' && 焦点下标 >= 筛选总行数) {
        let 列表相对下标 = 焦点下标 - 筛选总行数
        if (列表相对下标 === 0) {
          清理()
          完成({ 类型: '全部', 流程列表: 状态.候选流程列表 })
          return
        }
        let 选中项 = 状态.候选流程列表[列表相对下标 - 1]
        if (选中项 !== undefined) {
          清理()
          完成({ 类型: '单流程', 流程: 选中项.流程 })
          return
        }
      }

      let 最新状态 = 获得当前状态()
      let 最新筛选行数 =
        最新状态.保留标签维度列表.length + 最新状态.保留验收维度列表.length + 最新状态.保留需求维度列表.length
      let 最新最大焦点 = 最新筛选行数 + 1 + 最新状态.候选流程列表.length - 1
      焦点下标 = Math.min(焦点下标, Math.max(0, 最新最大焦点))
      渲染()
    }

    process.stdin.on('keypress', 处理按键)
    渲染()
  })
}

async function 主函数(): Promise<void> {
  let 根目录 = path.resolve(import.meta.dirname, '../../')
  let 需求目录 = path.join(根目录, 'test/requirement')
  let 模型列表 = await 加载所有模型(需求目录)
  let { 全部维度列表, 流程列表 } = 从模型列表提取级联元数据(模型列表)

  let 命令行参数 = process.argv.slice(2)
  let 全部运行 = false
  let 指定流程名称: string | undefined
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
      指定流程名称 = 参数.slice('--scenario='.length).trim()
    } else if (参数 === '--scenario') {
      指定流程名称 = 命令行参数[索引 + 1]?.trim()
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
  } else if (指定流程名称 !== undefined && 指定流程名称 !== '') {
    let 找到的流程 = 流程列表.find((项) => 项.流程名称 === 指定流程名称)
    if (找到的流程 === undefined) throw new Error(`找不到指定的流程场景: ${指定流程名称}`)
    目标 = { 类型: '单流程', 流程: 找到的流程.流程 }
  } else if (指定需求名称 !== undefined && 指定需求名称 !== '') {
    let 匹配的流程们 = 流程列表.filter((项) => 项.所属需求名称们.includes(指定需求名称))
    if (匹配的流程们.length === 0) throw new Error(`找不到包含需求“${指定需求名称}”的测试流程`)
    目标 = { 类型: '全部', 流程列表: 匹配的流程们 }
  } else {
    目标 = await 交互选择测试流程(全部维度列表, 流程列表)
  }

  let 演示模式: boolean
  if (指定模式 !== undefined) {
    演示模式 = 指定模式 === 'demo'
  } else if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
    let 回答 = await inquirer.prompt<{ 演示模式: boolean }>([
      {
        type: 'confirm',
        name: '演示模式',
        message: '是否使用演示 (Demo) 模式? (将开启浏览器 UI 并减慢执行速度)',
        default: false,
      },
    ])
    演示模式 = 回答.演示模式
  } else {
    演示模式 = false
  }

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
  } else if (人工流程名称列表.length > 0 && process.stdin.isTTY === true && process.stdout.isTTY === true) {
    let 回答 = await inquirer.prompt<{ 跳过人工验收: boolean }>([
      { type: 'confirm', name: '跳过人工验收', message: '是否跳过需要人工验收的测试？', default: 演示模式 === false },
    ])
    跳过人工验收 = 回答.跳过人工验收
  } else {
    跳过人工验收 = 演示模式 === false
  }
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

  let 子进程 = crossSpawn('playwright', 完整参数, { cwd: 根目录, stdio: 'inherit', env: 环境变量 })

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
