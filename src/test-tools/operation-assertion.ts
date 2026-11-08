import type { JSON值, JSON对象 } from './operation-record'

export function 读取操作结果字段(
  结果们: ReadonlyMap<number, JSON对象>,
  来源ID: number,
  路径: readonly (string | number)[],
): JSON值 {
  let 值: JSON值 | undefined = 结果们.get(来源ID)
  if (值 === undefined) throw new Error(`未获得操作 #${String(来源ID)} 的运行结果`)
  for (let 片段 of 路径) {
    if (typeof 片段 === 'number' && Array.isArray(值) && Object.hasOwn(值, 片段)) {
      值 = 值[片段]
    } else if (
      typeof 片段 === 'string' &&
      值 !== null &&
      typeof 值 === 'object' &&
      Array.isArray(值) === false &&
      Object.hasOwn(值, 片段)
    ) {
      值 = 值[片段]
    } else {
      值 = undefined
    }
    if (值 === undefined) throw new Error(`操作 #${String(来源ID)} 的运行结果缺少路径 ${JSON.stringify(路径)}`)
  }
  return 值
}
