import type { 需求测试结果 } from '../../../src/model/test-requirement'

export type 流程状态 = 需求测试结果['状态'] | '未执行'
export type 验收状态 = '已证明' | '部分通过' | '证明失败' | '未实现' | '未执行'
export type 标记样式 = 'ok' | 'advisory' | 'partial' | 'interrupted' | 'unimplemented' | 'neutral' | 'fail'

export let 流程状态样式: Record<流程状态, 标记样式> = {
  通过: 'ok',
  失败: 'fail',
  中断: 'interrupted',
  未执行: 'neutral',
}
export let 验收状态样式: Record<验收状态, 标记样式> = {
  已证明: 'ok',
  部分通过: 'partial',
  证明失败: 'fail',
  未实现: 'unimplemented',
  未执行: 'neutral',
}
export let 验收状态展示顺序: readonly 验收状态[] = ['证明失败', '未实现', '未执行', '部分通过', '已证明']

export function 汇总验收点状态(状态们: readonly 流程状态[]): 验收状态 {
  if (状态们.length === 0) return '未实现'
  if (状态们.some((状态) => 状态 === '失败' || 状态 === '中断')) return '证明失败'
  if (状态们.every((状态) => 状态 === '通过')) return '已证明'
  return 状态们.includes('通过') ? '部分通过' : '未执行'
}

export function 汇总需求状态(状态们: readonly 验收状态[]): 验收状态 {
  if (状态们.includes('证明失败')) return '证明失败'
  if (状态们.includes('未实现')) return '未实现'
  if (状态们.every((状态) => 状态 === '已证明')) return '已证明'
  return 状态们.some((状态) => 状态 === '已证明' || 状态 === '部分通过') ? '部分通过' : '未执行'
}

export let 状态规则说明 = {
  需求: {
    证明失败: '至少一个验收点证明失败。',
    未实现: '没有证明失败的验收点，但有验收点未实现。',
    未执行: '所有验收点都未执行。',
    部分通过: '有验收点已证明或部分通过，整体尚未证明，且没有证明失败或未实现的验收点。',
    已证明: '所有验收点都已证明。',
  } satisfies Record<验收状态, string>,
  验收点: {
    证明失败: '至少一条关联流程失败或中断。',
    未实现: '还没有关联流程。',
    未执行: '所有关联流程都未执行。',
    部分通过: '有流程通过，也有流程未执行，且没有失败或中断。',
    已证明: '所有关联流程都通过。',
  } satisfies Record<验收状态, string>,
  流程: {
    失败: '最后一次尝试失败。',
    中断: '最后一次尝试被中断。',
    未执行: '本次报告中没有运行这条流程。',
    通过: '最后一次尝试通过。',
  } satisfies Record<流程状态, string>,
}
