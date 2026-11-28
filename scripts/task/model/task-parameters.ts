import type { 任务表类型 } from './task-runner'

export function 获得参数传递目标(任务表: 任务表类型, 根任务名称: string): string | undefined {
  let 根任务 = 任务表[根任务名称]
  if (根任务 === undefined) throw new Error(`不存在任务: ${根任务名称}`)
  let 目标名称 = 根任务.参数传递目标
  if (目标名称 === undefined) return 根任务.传递参数 === true ? 根任务名称 : undefined
  if (根任务.传递参数 === true) throw new Error(`任务 ${根任务名称} 不能同时接收参数并转发参数`)
  let 目标 = 任务表[目标名称]
  if (目标 === undefined || 目标.传递参数 !== true || 目标.参数传递目标 !== undefined)
    throw new Error(`任务 ${根任务名称} 的参数目标必须是明确接收参数的任务: ${目标名称}`)
  let 已访问 = new Set<string>([根任务名称])
  let 待访问 = [...(根任务.依赖 ?? [])]
  while (待访问.length > 0) {
    let 名称 = 待访问.pop()
    if (名称 === undefined) throw new Error('任务依赖读取失败')
    if (已访问.has(名称) === true) continue
    已访问.add(名称)
    let 任务 = 任务表[名称]
    if (任务 === undefined) throw new Error(`不存在任务: ${名称}`)
    待访问.push(...(任务.依赖 ?? []))
  }
  if (目标名称 === 根任务名称 || 已访问.has(目标名称) === false)
    throw new Error(`任务 ${根任务名称} 的参数目标必须位于其依赖图中: ${目标名称}`)
  return 目标名称
}
