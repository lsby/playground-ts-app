import type { z } from 'zod'

import { 格式化歧义建议, 格式化点中元素 } from '../web-locate/diagnostics'
import type { 定位结果模型 } from './schema'

export type 定位结果 = z.infer<typeof 定位结果模型>

function 位置一致(新: 定位结果, 旧: 定位结果): boolean {
  return (['x', 'y', '元素宽', '元素高'] as const).every((键) => Math.abs(新[键] - 旧[键]) < 1)
}

/**
 * 点击前目标是否已停稳：唯一匹配、可见、中心点没被别的层盖住（可点击）、目标及祖先上没有还在播放的有限动画、
 * 连续两次定位位置大小不变。目标或祖先有循环动画时位置可能永远在变，只要求前面几项。
 */
export function 目标已停稳(值: 定位结果, 上次: 定位结果 | undefined): boolean {
  if (值.数量 !== 1 || 值.可点击 === false || 值.有限动画数 > 0) return false
  if (值.有无限动画) return true
  return 上次 !== undefined && 上次.数量 === 1 && 位置一致(值, 上次)
}

/** 超时报错用：说明目标没停稳卡在哪一项，被谁盖住，匹配多个时附上各项的推荐定位。 */
export function 说明未停稳原因(值: 定位结果 | undefined, 上次: 定位结果 | undefined): string {
  if (值 === undefined) return ''
  let 原因们: string[] = []
  if (值.盖住者 !== undefined) 原因们.push(`被别的元素盖住：${格式化点中元素(值.盖住者)}`)
  if (值.有限动画数 > 0) 原因们.push(`目标或祖先上仍有 ${String(值.有限动画数)} 个有限动画在播放`)
  if (
    值.数量 === 1 &&
    值.可点击 &&
    值.有限动画数 === 0 &&
    值.有无限动画 === false &&
    上次 !== undefined &&
    位置一致(值, 上次) === false
  )
    原因们.push('目标位置或大小仍在变化')
  let 歧义 =
    值.数量 > 1 && 值.匹配们 !== undefined
      ? `\n${格式化歧义建议(值.匹配们, { 总数: 值.数量, 序号写法: '在原选择器后加 " >> nth={序号}"（webSelector 写法）' })}`
      : ''
  return `${原因们.length > 0 ? `；${原因们.join('；')}` : ''}${歧义}`
}
