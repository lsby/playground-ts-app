import inquirer from 'inquirer'
import path from 'node:path'
import { 交互选择测试流程, 加载需求测试选择数据 } from '../../test/requirement-selection'
import type { 流程展示项 } from '../../test/requirement-selector-renderer'
import type { 任务准备上下文, 任务准备结果 } from '../model/task-runner'

function 获得已指定流程名称组(参数组: string[]): string[] {
  let 结果: string[] = []
  for (let 索引 = 0; 索引 < 参数组.length; 索引 += 1) {
    let 参数 = 参数组[索引]
    if (参数 === undefined) continue
    if (参数.startsWith('--scenario=') === true) 结果.push(参数.slice('--scenario='.length).trim())
    else if (参数 === '--scenario') {
      let 名称 = 参数组[索引 + 1]
      if (名称 !== undefined) 结果.push(名称.trim())
      索引 += 1
    }
  }
  return 结果.filter((名称) => 名称 !== '')
}

function 获得选中流程(参数组: string[], 流程列表: 流程展示项[]): 流程展示项[] | undefined {
  if (参数组.includes('--all') === true) return 流程列表
  let 流程名称组 = 获得已指定流程名称组(参数组)
  if (流程名称组.length > 0) {
    return 流程名称组.map((名称) => {
      let 流程 = 流程列表.find((项) => 项.流程名称 === 名称)
      if (流程 === undefined) throw new Error(`找不到指定的流程场景: ${名称}`)
      return 流程
    })
  }
  let 需求参数索引 = 参数组.findIndex((参数) => 参数 === '--requirement' || 参数.startsWith('--requirement=') === true)
  if (需求参数索引 === -1) return undefined
  let 参数 = 参数组[需求参数索引]
  if (参数 === undefined) throw new Error('需求参数索引越界')
  let 需求名称 =
    参数.startsWith('--requirement=') === true ? 参数.slice('--requirement='.length) : 参数组[需求参数索引 + 1]
  if (需求名称 === undefined || 需求名称.trim() === '') throw new Error('--requirement 后必须提供需求名称')
  let 结果 = 流程列表.filter((项) => 项.所属需求名称们.includes(需求名称.trim()))
  if (结果.length === 0) throw new Error(`找不到包含需求“${需求名称}”的测试流程`)
  return 结果
}

export async function 准备需求测试参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  let 参数组 = [...上下文.参数]
  let 需求目录 = path.resolve(上下文.工作目录, 'test/requirement')
  let { 全部维度列表, 流程列表 } = await 加载需求测试选择数据(需求目录)
  let 选中流程 = 获得选中流程(参数组, 流程列表)
  if (选中流程 === undefined) {
    let 目标 = await 交互选择测试流程(全部维度列表, 流程列表)
    switch (目标.类型) {
      case '单流程':
        选中流程 = [流程列表.find((项) => 项.流程 === 目标.流程)].filter((项) => 项 !== undefined)
        break
      case '全部':
        选中流程 = 目标.流程列表
        break
    }
    if (选中流程.length === 流程列表.length) 参数组.push('--all')
    else for (let 流程 of 选中流程) 参数组.push('--scenario', 流程.流程名称)
  }
  let 已指定模式 = 参数组.some((参数) => 参数 === '--demo' || 参数 === '--auto' || 参数 === '--mode')
  let 演示模式 = 参数组.includes('--demo')
  let 模式参数索引 = 参数组.indexOf('--mode')
  if (模式参数索引 !== -1) 演示模式 = 参数组[模式参数索引 + 1] === 'demo'
  if (已指定模式 === false) {
    if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) 参数组.push('--auto')
    else {
      let 回答 = await inquirer.prompt<{ 演示模式: boolean }>([
        {
          type: 'confirm',
          name: '演示模式',
          message: '是否使用演示 (Demo) 模式? (将开启浏览器 UI 并减慢执行速度)',
          default: false,
        },
      ])
      演示模式 = 回答.演示模式
      参数组.push(演示模式 === true ? '--demo' : '--auto')
    }
  }
  let 人工流程名称列表 = 选中流程.filter((流程) => 流程.包含人工验收).map((流程) => 流程.流程名称)
  let 已指定跳过 = 参数组.includes('--skip-manual') === true || 参数组.includes('--no-skip-manual') === true
  if (已指定跳过 === false) {
    if (人工流程名称列表.length === 0) 参数组.push('--skip-manual')
    else if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) 参数组.push('--skip-manual')
    else {
      let 回答 = await inquirer.prompt<{ 跳过人工验收: boolean }>([
        { type: 'confirm', name: '跳过人工验收', message: '是否跳过需要人工验收的测试？', default: 演示模式 === false },
      ])
      参数组.push(回答.跳过人工验收 === true ? '--skip-manual' : '--no-skip-manual')
    }
  }
  return { 参数: 参数组 }
}
