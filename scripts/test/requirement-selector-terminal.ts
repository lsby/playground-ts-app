/** 终端需求选择器的响应式显示与文本搜索工具。 */
export function 文本匹配搜索词(可搜索文本: string, 搜索词: string): boolean {
  let 规范化搜索词 = 搜索词.trim().toLocaleLowerCase('zh-CN')
  let 关键词们 = 规范化搜索词.split(/\s+/u).filter((词) => 词 !== '')
  if (关键词们.length === 0) return true
  let 规范化可搜索文本 = 可搜索文本.trim().toLocaleLowerCase('zh-CN')
  return 关键词们.every((关键词) => 规范化可搜索文本.includes(关键词))
}

function 字符显示宽度(字符: string): number {
  let 码点 = 字符.codePointAt(0) ?? 0
  if ((码点 >= 0x0300 && 码点 <= 0x036f) || (码点 >= 0xfe00 && 码点 <= 0xfe0f) || 码点 === 0x200d) return 0
  return 码点 >= 0x1100 &&
    (码点 <= 0x115f ||
      码点 === 0x2329 ||
      码点 === 0x232a ||
      (码点 >= 0x2e80 && 码点 <= 0xa4cf) ||
      (码点 >= 0xac00 && 码点 <= 0xd7a3) ||
      (码点 >= 0xf900 && 码点 <= 0xfaff) ||
      (码点 >= 0xfe10 && 码点 <= 0xfe6f) ||
      (码点 >= 0xff00 && 码点 <= 0xff60) ||
      (码点 >= 0x1f300 && 码点 <= 0x1faff) ||
      (码点 >= 0x20000 && 码点 <= 0x3fffd))
    ? 2
    : 1
}

export function 截断终端行(行: string, 最大宽度: number): string {
  let 当前宽度 = 0
  let 结果们: { 字符: string; 宽度: number }[] = []
  for (let 字符 of 行) {
    let 宽度 = 字符显示宽度(字符)
    if (当前宽度 + 宽度 > 最大宽度) {
      while (当前宽度 + 1 > 最大宽度) 当前宽度 -= 结果们.pop()?.宽度 ?? 0
      return `${结果们.map((项) => 项.字符).join('')}…`
    }
    结果们.push({ 字符, 宽度 })
    当前宽度 += 宽度
  }
  return 结果们.map((项) => 项.字符).join('')
}

export function 获得终端行数(): number {
  return process.stdout.rows > 0 ? process.stdout.rows : 24
}

export function 获得终端列数(): number {
  return process.stdout.columns > 0 ? process.stdout.columns : 80
}

export function 是紧凑终端(): boolean {
  return 获得终端行数() < 16
}

export function 计算每屏方案数(筛选行数: number): number {
  let 保留行数 = 是紧凑终端() ? 7 : 11
  return Math.max(1, Math.min(10, 获得终端行数() - 筛选行数 - 保留行数))
}
