import type { 需求, 需求测试流程, 验收点 } from '../../../src/model/test-requirement'
import { 转义Html } from './report-evidence'
import { 汇总需求状态, 汇总验收点状态, type 流程状态, type 验收状态 } from './report-status'

export type 需求测试登记 = { 流程: 需求测试流程; 需求们: readonly 需求[]; 文件: string }
export type 报告范围 = {
  需求们: readonly 需求[]
  需求描述路径们: ReadonlyMap<需求, string>
  流程们: readonly 需求测试登记[]
  选中流程们: readonly 需求测试登记[]
  显示未执行: boolean
}
export type 目录流程 = { id: string; 测试: 需求测试登记; 状态: 流程状态; 有建议: boolean }
export type 验收目录项 = {
  id: string
  点: 验收点
  状态: 验收状态
  有建议: boolean
  关联流程们: readonly 目录流程[]
  隐藏流程数: number
}
type 需求目录项 = {
  需求: 需求
  目录层级: readonly string[]
  状态: 验收状态
  有建议: boolean
  条目们: readonly 验收目录项[]
  验收点状态们: readonly 验收状态[]
  隐藏验收点数: number
}

export function 生成报告目录(
  范围: 报告范围,
  已执行状态: ReadonlyMap<需求测试流程, 流程状态>,
): { 流程编号们: readonly 目录流程[]; 需求条目们: readonly 需求目录项[]; 可见验收点集合: ReadonlySet<验收点> } {
  let 选中流程集合 = new Set(范围.选中流程们.map(({ 流程 }) => 流程))
  let 需求集合 = new Set(范围.需求们)
  let 点索引 = new Map<验收点, { 关联流程们: 目录流程[]; 隐藏流程数: number }>()
  let 流程编号们: 目录流程[] = []
  for (let 测试 of 范围.流程们) {
    if (选中流程集合.has(测试.流程) === false && 测试.需求们.some((需求) => 需求集合.has(需求)) === false) continue
    let 状态 = 已执行状态.get(测试.流程) ?? '未执行'
    let 目录项 =
      范围.显示未执行 || 状态 !== '未执行'
        ? {
            id: `flow-${String(流程编号们.length + 1)}`,
            测试,
            状态,
            有建议: 测试.流程.获得步骤们().some((步骤) => 步骤.获得建议们().length > 0),
          }
        : undefined
    if (目录项 !== undefined) 流程编号们.push(目录项)
    for (let 点 of 测试.流程.获得覆盖验收点们()) {
      let 关联 = 点索引.get(点) ?? { 关联流程们: [], 隐藏流程数: 0 }
      if (目录项 === undefined) 关联.隐藏流程数 += 1
      else 关联.关联流程们.push(目录项)
      点索引.set(点, 关联)
    }
  }
  let 点序号 = 0
  let 可见验收点集合 = new Set<验收点>()
  let 需求条目们 = 范围.需求们.map((需求): 需求目录项 => {
    let 条目们: 验收目录项[] = []
    let 状态们: 验收状态[] = []
    for (let 点 of 需求.获得验收点们()) {
      let { 关联流程们, 隐藏流程数 } = 点索引.get(点) ?? { 关联流程们: [], 隐藏流程数: 0 }
      let 流程状态们 = 关联流程们.map((流程) => 流程.状态)
      if (隐藏流程数 > 0) 流程状态们.push('未执行')
      let 状态 = 汇总验收点状态(流程状态们)
      状态们.push(状态)
      if (范围.显示未执行 === false && (状态 === '未执行' || 状态 === '未实现')) continue
      可见验收点集合.add(点)
      点序号 += 1
      条目们.push({
        id: `acceptance-${String(点序号)}`,
        点,
        状态,
        有建议: 关联流程们.some((流程) => 流程.有建议),
        关联流程们,
        隐藏流程数,
      })
    }
    return {
      需求,
      目录层级: 范围.需求描述路径们.get(需求)?.split('/').slice(0, -2) ?? [],
      状态: 汇总需求状态(状态们),
      有建议: 条目们.some((条目) => 条目.有建议),
      条目们,
      验收点状态们: 状态们,
      隐藏验收点数: 状态们.length - 条目们.length,
    }
  })
  return { 流程编号们, 需求条目们, 可见验收点集合 }
}

type 导航条目 = { 目录层级: readonly string[]; 内容: string }
type 导航目录 = { 名称: string; 子目录: Map<string, 导航目录>; 子项: (string | 导航目录)[] }

export function 生成导航目录Html(条目们: readonly 导航条目[]): string {
  let 根目录: 导航目录 = { 名称: '', 子目录: new Map(), 子项: [] }
  for (let { 目录层级, 内容 } of 条目们) {
    let 当前目录 = 根目录
    for (let 名称 of 目录层级) {
      let 子目录 = 当前目录.子目录.get(名称)
      if (子目录 === undefined) {
        子目录 = { 名称, 子目录: new Map(), 子项: [] }
        当前目录.子目录.set(名称, 子目录)
        当前目录.子项.push(子目录)
      }
      当前目录 = 子目录
    }
    当前目录.子项.push(内容)
  }
  return 渲染子项(根目录)
}

function 渲染子项(目录: 导航目录): string {
  return 目录.子项
    .map((子项) =>
      typeof 子项 === 'string'
        ? 子项
        : `<details class="requirement-folder" data-requirement-folder><summary>${转义Html(子项.名称)}</summary><div>${渲染子项(子项)}</div></details>`,
    )
    .join('')
}
