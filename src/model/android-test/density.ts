export function 解析安卓屏幕密度(输出: string): number {
  let 物理密度: number | undefined
  let 覆盖密度: number | undefined
  for (let 行 of 输出.trim().split(/\r?\n/u)) {
    let 匹配 = /^(Physical|Override) density: ([1-9]\d*)$/u.exec(行.trim())
    if (匹配 === null) throw new Error(`无法解析 Android 屏幕密度：${行.trim()}`)
    let 类型 = 密度类型模型.parse(匹配[1])
    let 密度 = Number(匹配[2])
    if (Number.isSafeInteger(密度) === false) throw new Error('Android 屏幕密度超出有效整数范围')
    switch (类型) {
      case 'Physical':
        if (物理密度 !== undefined) throw new Error('Android 屏幕物理密度重复')
        物理密度 = 密度
        break
      case 'Override':
        if (覆盖密度 !== undefined) throw new Error('Android 屏幕覆盖密度重复')
        覆盖密度 = 密度
        break
    }
  }
  if (物理密度 === undefined) throw new Error('Android 屏幕缺少物理密度')
  return 覆盖密度 ?? 物理密度
}
import { z } from 'zod'

let 密度类型模型 = z.enum(['Physical', 'Override'])
