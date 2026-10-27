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

function 是测试模型(值: unknown): 值 is 测试模型<已审阅的any, 已审阅的any> {
  if (值 instanceof 测试模型) return true
  return typeof 值 === 'object' && 值 !== null && '元数据' in 值 && '需求们' in 值 && '流程们' in 值
}

async function 加载所有模型(目录: string): Promise<测试模型<已审阅的any, 已审阅的any>[]> {
  let 文件列表 = await fs.readdir(目录, { recursive: true })
  let 模型文件列表 = 文件列表.filter((文件) => path.basename(文件) === 'model.ts')
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

export async function 加载需求测试选择数据(
  需求目录: string,
): Promise<{ 全部维度列表: 级联维度项[]; 流程列表: 流程展示项[] }> {
  return 从模型列表提取级联元数据(await 加载所有模型(需求目录))
}

export async function 交互选择测试流程(全部维度列表: 级联维度项[], 全部流程列表: 流程展示项[]): Promise<筛选目标> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) return { 类型: '全部', 流程列表: 全部流程列表 }
  let 当前选择值映射 = new Map<string, string>()
  for (let 维度 of 全部维度列表) {
    let 通配选项 = 维度.原始选项们.find((项) => 项.是通配 === true) ?? 维度.原始选项们[0]
    if (通配选项 !== undefined) 当前选择值映射.set(维度.唯一标识, 通配选项.值)
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
      let 最大焦点 = 筛选总行数 + 状态.候选流程列表.length
      if (按键信息.ctrl === true && 按键信息.name === 'c') {
        清理()
        process.exit(0)
      }
      if (正在编辑搜索 === true) {
        if (按键信息.name === 'escape' || 按键信息.name === 'return') 正在编辑搜索 = false
        else if (按键信息.name === 'backspace') 搜索词 = Array.from(搜索词).slice(0, -1).join('')
        else if (字符 !== undefined && 字符 >= ' ' && 按键信息.ctrl !== true) 搜索词 += 字符
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
      if (按键信息.name === 'up') 焦点下标 = Math.max(0, 焦点下标 - 1)
      else if (按键信息.name === 'down') 焦点下标 = Math.min(最大焦点, 焦点下标 + 1)
      else if (按键信息.name === 'left' || 按键信息.name === 'right') {
        let 方向量 = 按键信息.name === 'right' ? 1 : -1
        if (焦点下标 < 筛选总行数) {
          let 当前活跃维度 = 状态.活跃维度列表[焦点下标]
          if (当前活跃维度 !== undefined && 当前活跃维度.当前有效选项们.length > 1) {
            let 选项总数 = 当前活跃维度.当前有效选项们.length
            let 新下标 = (当前活跃维度.当前选中下标 + 方向量 + 选项总数) % 选项总数
            let 新选项 = 当前活跃维度.当前有效选项们[新下标]
            if (新选项 !== undefined) 当前选择值映射.set(当前活跃维度.唯一标识, 新选项.值)
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
      let 最新最大焦点 = 最新筛选行数 + 最新状态.候选流程列表.length
      焦点下标 = Math.min(焦点下标, Math.max(0, 最新最大焦点))
      渲染()
    }
    process.stdin.on('keypress', 处理按键)
    渲染()
  })
}
