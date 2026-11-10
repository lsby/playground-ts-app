import type { 需求, 验收点 } from '../../../src/model/test-requirement'
import type { 需求测试登记 } from './report-directory'

export type 标签过滤 = { 模式: '排除' | '包括'; 标签们: readonly string[] }
export type 标签来源 = { 层级: '需求' | '验收点' | '流程'; 名称: string; 标签们: readonly string[] }

function 来源(层级: 标签来源['层级'], 条目: Pick<需求, '获得名称' | '获得标签们'>): 标签来源 {
  return { 层级, 名称: 条目.获得名称(), 标签们: 条目.获得标签们() }
}

export function 匹配标签(过滤: 标签过滤 | undefined, 标签们: readonly string[]): boolean {
  if (过滤 === undefined) return true
  let 命中 = 过滤.标签们.some((标签) => 标签们.includes(标签))
  return 过滤.模式 === '包括' ? 命中 : 命中 === false
}

export function 解析标签过滤(排除: readonly string[] = [], 包括: readonly string[] = []): 标签过滤 | undefined {
  if (排除.length > 0 && 包括.length > 0) throw new Error('--exclude-tag 和 --include-tag 只能选择一种')
  let 标签们 = [...new Set((排除.length > 0 ? 排除 : 包括).map((标签) => 标签.trim()))]
  if (标签们.includes('')) throw new Error('--exclude-tag 和 --include-tag 后必须提供非空标签')
  return 标签们.length === 0 ? undefined : { 模式: 排除.length > 0 ? '排除' : '包括', 标签们 }
}

export function 过滤需求流程<登记 extends 需求测试登记>(
  候选流程们: readonly 登记[],
  过滤: 标签过滤 | undefined,
): { 选中流程们: readonly 登记[]; 排除流程们: ReadonlyMap<登记['流程'], readonly 标签来源[]> } {
  let 选中流程们: 登记[] = []
  let 排除流程们 = new Map<登记['流程'], readonly 标签来源[]>()
  for (let 登记 of 候选流程们) {
    let { 流程, 需求们 } = 登记
    let 来源们 = [
      ...需求们.map((需求) => 来源('需求', 需求)),
      ...流程.获得覆盖验收点们().map((点) => 来源('验收点', 点)),
      来源('流程', 流程),
    ]
    let 命中来源们 = 来源们
      .map((项) => ({ ...项, 标签们: 项.标签们.filter((标签) => 过滤?.标签们.includes(标签) === true) }))
      .filter((项) => 项.标签们.length > 0)
    if (
      匹配标签(
        过滤,
        命中来源们.flatMap((项) => 项.标签们),
      )
    )
      选中流程们.push(登记)
    else 排除流程们.set(流程, 命中来源们)
  }
  return { 选中流程们, 排除流程们 }
}

export function 验证标签存在(
  过滤: 标签过滤 | undefined,
  条目们: readonly (需求 | 验收点 | 需求测试登记['流程'])[],
): void {
  if (过滤 === undefined) return
  let 已知标签 = new Set(条目们.flatMap((条目) => [...条目.获得标签们()]))
  let 未知标签 = 过滤.标签们.filter((标签) => 已知标签.has(标签) === false)
  if (未知标签.length > 0) throw new Error(`找不到需求测试标签：${未知标签.join('、')}`)
}
