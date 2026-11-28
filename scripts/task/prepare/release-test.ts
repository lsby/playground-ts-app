import inquirer from 'inquirer'
import { 分离发布参数, 解析发布测试参数 } from '../../release/unit-test-options'
import type { 任务准备上下文, 任务准备结果 } from '../model/task-runner'
import { 准备单元测试参数 } from './test-unit'

export async function 准备发布测试参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  let { 运行单测, 过滤器 } = 解析发布测试参数(上下文.参数)
  let 可交互 = process.stdin.isTTY === true && process.stdout.isTTY === true
  if (运行单测 === undefined) {
    if (可交互 === false) throw new Error('非交互发布必须指定 --unit-tests=true 或 --unit-tests=false')
    let 回答 = await inquirer.prompt<{ 运行单测: boolean }>([
      { type: 'confirm', name: '运行单测', message: '发布前是否运行单元测试？', default: true },
    ])
    运行单测 = 回答.运行单测
  }
  if (运行单测 === false) {
    if (过滤器 !== undefined) throw new Error('跳过单元测试时不能指定 --unit-test-filter')
    return { 参数: ['--unit-tests=false'] }
  }
  if (过滤器 === undefined) {
    if (可交互 === false) throw new Error('运行单元测试时必须指定 --unit-test-filter=<正则>，全量使用 .*')
    let 准备结果 = await 准备单元测试参数({ ...上下文, 参数: [] })
    过滤器 = 准备结果.参数[1]
    if (过滤器 === undefined) throw new Error('未获得单元测试筛选正则')
  }
  new RegExp(过滤器)
  return { 参数: [`--unit-tests=true`, `--unit-test-filter=${过滤器}`] }
}

export async function 准备完整发布参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  let { 版本参数, 测试参数 } = 分离发布参数(上下文.参数)
  let 测试结果 = await 准备发布测试参数({ ...上下文, 参数: 测试参数 })
  return { 参数: [], 依赖参数: { 'release:version': 版本参数, 'release:test': 测试结果.参数 } }
}
