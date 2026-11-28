export { 操作记录文档模型 } from './recording-schema'

import type { 回放步骤选择, 操作断言条目, 操作记录条目, 操作调用条目 } from './recording-types'

/** 已排除：一定没有副作用或被测试方标为无效，导出默认不带；待确认：动作可能已生效，导出前须逐条处理；正常：照常导出。 */
export type 记录状态 = '正常' | '待确认' | '已排除'

export function 计算记录状态(条目: 操作记录条目): { state: 记录状态; stateReason?: string } {
  if (条目.kind !== 'call') return { state: '正常' }
  if (条目.invalid !== undefined) return { state: '已排除', stateReason: `点错了/无效：${条目.invalid.reason}` }
  if (条目.status !== 'failed') return { state: '正常' }
  if (条目.failurePhase === 'before-action')
    return { state: '已排除', stateReason: `动作执行前就失败，没有副作用：${条目.error}` }
  if (条目.confirmed === true) return { state: '正常', stateReason: `动作后失败，已确认保留：${条目.error}` }
  return { state: '待确认', stateReason: `动作已执行但之后失败，可能已生效：${条目.error}` }
}

type 步骤位置 = { 步骤位置: number; 组内位置: number }

function 查找位置(步骤们: readonly 回放步骤选择[], 编号: number): 步骤位置 {
  let 步骤位置 = 步骤们.findIndex((步骤) => 步骤.条目编号们.includes(编号))
  if (步骤位置 < 0) throw new Error(`操作 #${String(编号)} 未纳入回放草稿，请先恢复`)
  return { 步骤位置, 组内位置: 步骤们[步骤位置]?.条目编号们.indexOf(编号) ?? 0 }
}

function 靠后(甲: 步骤位置, 乙: 步骤位置): boolean {
  return 甲.步骤位置 > 乙.步骤位置 || (甲.步骤位置 === 乙.步骤位置 && 甲.组内位置 > 乙.组内位置)
}

function 是同源断言(条目们: ReadonlyMap<number, 操作记录条目>, 编号: number | undefined, 来源ID: number): boolean {
  if (编号 === undefined) return false
  let 条目 = 条目们.get(编号)
  return 条目?.kind === 'assertion' && 条目.sourceId === 来源ID
}

/** 把断言放进步骤们：锚点在命名分组（或多条目步骤）里就插进该分组，否则单独成步骤。排在同一被断言操作已有的断言之后。 */
function 插入到锚点后(
  步骤们: { 名称?: string | undefined; 条目编号们: number[] }[],
  条目们: ReadonlyMap<number, 操作记录条目>,
  断言编号: number,
  锚点: 步骤位置,
  来源ID: number,
): void {
  let 步骤 = 步骤们[锚点.步骤位置]
  if (步骤 === undefined) throw new Error(`找不到操作所在的回放步骤`)
  if (步骤.名称 !== undefined || 步骤.条目编号们.length > 1) {
    let 位置 = 锚点.组内位置 + 1
    while (是同源断言(条目们, 步骤.条目编号们[位置], 来源ID)) 位置 += 1
    步骤.条目编号们.splice(位置, 0, 断言编号)
    return
  }
  let 位置 = 锚点.步骤位置 + 1
  while (
    步骤们[位置]?.名称 === undefined &&
    步骤们[位置]?.条目编号们.length === 1 &&
    是同源断言(条目们, 步骤们[位置]?.条目编号们[0], 来源ID)
  )
    位置 += 1
  步骤们.splice(位置, 0, { 条目编号们: [断言编号] })
}

function 复制步骤们(步骤们: readonly 回放步骤选择[]): { 名称?: string | undefined; 条目编号们: number[] }[] {
  return 步骤们.map((步骤) => ({ ...步骤, 条目编号们: [...步骤.条目编号们] }))
}

/**
 * 计算断言插入后的回放步骤。默认紧跟被断言的操作（有对照来源时紧跟其中较晚的一个），
 * 也可以用 指定锚点 显式指定放在哪个回放条目之后。
 */
export function 计算插入断言后的步骤(
  步骤们: readonly 回放步骤选择[],
  条目们: ReadonlyMap<number, 操作记录条目>,
  断言编号: number,
  来源ID: number,
  期望来源ID: number | undefined,
  指定锚点: number | undefined,
): 回放步骤选择[] {
  let 锚点 = 查找位置(步骤们, 指定锚点 ?? 来源ID)
  if (指定锚点 === undefined && 期望来源ID !== undefined) {
    let 期望位置 = 查找位置(步骤们, 期望来源ID)
    if (靠后(期望位置, 锚点)) 锚点 = 期望位置
  }
  let 候选 = 复制步骤们(步骤们)
  插入到锚点后(候选, 条目们, 断言编号, 锚点, 来源ID)
  return 候选
}

/**
 * 显式指定导出步骤时，回放草稿里有、但步骤里没写的断言，只要它引用的操作都在步骤里，就自动放在被断言的操作后面，
 * 不用测试方手动对齐编号或移动。步骤里已经写出的断言保持测试方的位置。
 */
export function 附带遗漏的断言(
  步骤组: readonly 回放步骤选择[],
  回放步骤: readonly 回放步骤选择[],
  条目们: ReadonlyMap<number, 操作记录条目>,
): 回放步骤选择[] {
  let 选中编号们 = new Set(步骤组.flatMap((步骤) => 步骤.条目编号们))
  let 草稿编号们 = new Set(回放步骤.flatMap((步骤) => 步骤.条目编号们))
  let 候选 = 复制步骤们(步骤组)
  let 遗漏们 = [...条目们.values()].filter(
    (条目): 条目 is 操作断言条目 =>
      条目.kind === 'assertion' && 草稿编号们.has(条目.id) && 选中编号们.has(条目.id) === false,
  )
  for (let 断言 of 遗漏们) {
    let 来源们 = [断言.sourceId, ...(断言.expectedFrom === undefined ? [] : [断言.expectedFrom.sourceId])]
    if (来源们.every((编号) => 选中编号们.has(编号)) === false) continue
    let 锚点 = 来源们.map((编号) => 查找位置(候选, 编号)).reduce((甲, 乙) => (靠后(乙, 甲) ? 乙 : 甲))
    插入到锚点后(候选, 条目们, 断言.id, 锚点, 断言.sourceId)
    选中编号们.add(断言.id)
  }
  return 候选
}

/** 读回落盘的条目。上次服务中断时还在运行的调用没有结果，改记为动作后失败（是否生效未知），由测试方确认。 */
export function 读回条目们(条目们: readonly 操作记录条目[], 恢复时间: string): Map<number, 操作记录条目> {
  return new Map(
    条目们.map((条目): [number, 操作记录条目] => {
      if (条目.kind !== 'call' || 条目.status !== 'pending') return [条目.id, 条目]
      let { status: _状态, ...其余 } = 条目
      return [
        条目.id,
        {
          ...其余,
          status: 'failed',
          error: '录制服务中断时这条操作仍在运行，是否已生效未知',
          failurePhase: 'after-action',
          end: 恢复时间,
          artifacts: [],
          evidenceErrors: [],
        },
      ]
    }),
  )
}

function 取调用条目(条目们: ReadonlyMap<number, 操作记录条目>, id: number): 操作调用条目 {
  let 条目 = 条目们.get(id)
  if (条目 === undefined) throw new Error(`找不到操作记录 #${String(id)}`)
  if (条目.kind !== 'call')
    throw new Error(`只有工具调用可以标记，#${String(id)} 是${条目.kind === 'assertion' ? '断言' : '手动补录'}`)
  if (条目.status === 'pending') throw new Error(`操作 #${String(id)} 尚未完成`)
  return 条目
}

/** 给调用写上或取消「点错了/无效」标记（理由为 null 取消）。 */
export function 应用无效标记(
  条目们: ReadonlyMap<number, 操作记录条目>,
  ids: readonly number[],
  理由: string | null,
  时间: string,
): Map<number, 操作记录条目> {
  let 结果 = new Map(条目们)
  for (let id of ids) {
    let 条目 = 取调用条目(条目们, id)
    if (理由 === null) {
      let { invalid: _无效, ...其余 } = 条目
      结果.set(id, 其余)
    } else 结果.set(id, { ...条目, invalid: { reason: 理由, at: 时间 } })
  }
  return 结果
}

/** 确认保留动作后失败的调用。 */
export function 应用确认保留(
  条目们: ReadonlyMap<number, 操作记录条目>,
  ids: readonly number[],
): Map<number, 操作记录条目> {
  let 结果 = new Map(条目们)
  for (let id of ids) {
    let 条目 = 条目们.get(id)
    if (条目 === undefined) throw new Error(`找不到操作记录 #${String(id)}`)
    if (条目.kind !== 'call' || 计算记录状态(条目).state !== '待确认')
      throw new Error(`操作 #${String(id)} 不是待确认记录，不需要确认`)
    结果.set(id, { ...条目, confirmed: true })
  }
  return 结果
}

/** 尚未处理的待确认调用：还在回放草稿（或本次导出范围）里的才算，已删除的视为已处理。 */
export function 列出待确认(
  条目们: ReadonlyMap<number, 操作记录条目>,
  草稿编号们: ReadonlySet<number>,
  范围编号们?: ReadonlySet<number>,
): 操作调用条目[] {
  return [...条目们.values()].filter(
    (条目): 条目 is 操作调用条目 =>
      条目.kind === 'call' &&
      计算记录状态(条目).state === '待确认' &&
      (草稿编号们.has(条目.id) || 范围编号们?.has(条目.id) === true),
  )
}

export function 生成待确认错误(待确认们: readonly 操作调用条目[]): Error {
  let 列表 = 待确认们
    .map((条目) => `#${String(条目.id)} ${条目.tool}：${条目.status === 'failed' ? 条目.error : ''}`)
    .join('\n')
  return new Error(
    `还有 ${String(待确认们.length)} 条待确认记录（动作已执行，但之后的等待或校验失败，可能已生效），导出前请逐条处理：\n${列表}\n` +
      '确认动作确实生效、要保留的用 record_confirm；点错了或无效的用 record_mark 写明原因，或用 record_remove 删除。',
  )
}

/** 导出时已排除的调用不能带；返回原因，可导出返回 undefined。 */
export function 导出阻止原因(条目: 操作调用条目): string | undefined {
  let { state, stateReason } = 计算记录状态(条目)
  return state === '已排除' ? `已排除，不能导出：${stateReason ?? ''}` : undefined
}

export type 逐条排除结果 = {
  /** 这次从回放草稿里删掉的 */
  已排除: number[]
  /** 本来就不在回放草稿里（动作前失败、被标无效等「已排除」的条目），不用再删，也算处理完 */
  本来就不在回放: number[]
  /** 删不掉的（找不到、被还在回放里的断言依赖等），带原因 */
  跳过: { id: number; 原因: string }[]
}

/**
 * 逐条排除：每条单独处理，一条失败不影响别的。批内有互相依赖（断言依赖调用）时，
 * 失败的留到下一轮重试，直到一轮没有任何进展为止，所以传入顺序不影响结果；重复编号只处理一次。
 */
export function 逐条排除条目(
  ids: readonly number[],
  操作: { 查找: (id: number) => void; 在回放: (id: number) => boolean; 排除: (id: number) => void },
): 逐条排除结果 {
  let 已排除: number[] = []
  let 本来就不在回放: number[] = []
  let 原因们 = new Map<number, string>()
  let 剩余 = [...new Set(ids)]
  let 有进展 = true
  while (有进展 && 剩余.length > 0) {
    有进展 = false
    let 下一批: number[] = []
    for (let id of 剩余) {
      try {
        操作.查找(id)
        if (操作.在回放(id)) {
          操作.排除(id)
          已排除.push(id)
        } else 本来就不在回放.push(id)
        有进展 = true
      } catch (错误) {
        原因们.set(id, 错误 instanceof Error ? 错误.message : String(错误))
        下一批.push(id)
      }
    }
    剩余 = 下一批
  }
  return { 已排除, 本来就不在回放, 跳过: 剩余.map((id) => ({ id, 原因: 原因们.get(id) ?? '未知原因' })) }
}
