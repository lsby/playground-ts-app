export function 脱敏请求头(头: Record<string, string>): Record<string, string> {
  let 结果: Record<string, string> = {}
  for (let [键, 值] of Object.entries(头)) {
    let 小写键 = 键.toLowerCase()
    结果[键] = 小写键 === 'authorization' || 小写键 === 'cookie' ? '[已隐藏]' : 值
  }
  return 结果
}

export function 获得请求体摘要(请求体: string | FormData): Record<string, string | number> {
  if (请求体 instanceof FormData) return { 类型: 'FormData', 字段数量: [...请求体.keys()].length }
  return { 类型: '文本', 字符数量: 请求体.length }
}

export function 获得错误摘要(错误: unknown): Record<string, string> {
  return { 类型: 错误 instanceof Error ? 错误.name : typeof 错误 }
}
