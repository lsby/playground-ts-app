export type 发布测试选项 = { 运行单测?: boolean; 过滤器?: string }

export function 解析发布测试参数(参数组: readonly string[]): 发布测试选项 {
  let 结果: 发布测试选项 = {}
  for (let 索引 = 0; 索引 < 参数组.length; 索引 += 1) {
    let 参数 = 参数组[索引]
    if (参数 === undefined) throw new Error('发布单测参数索引越界')
    let 等号 = 参数.indexOf('=')
    let 名称 = 等号 === -1 ? 参数 : 参数.slice(0, 等号)
    if (名称 !== '--unit-tests' && 名称 !== '--unit-test-filter') throw new Error(`未知发布单测参数: ${参数}`)
    let 值 = 等号 === -1 ? 参数组[++索引] : 参数.slice(等号 + 1)
    if (值 === undefined || 值.trim() === '' || 值.startsWith('--')) throw new Error(`${名称} 后必须提供值`)
    switch (名称) {
      case '--unit-tests':
        if (结果.运行单测 !== undefined) throw new Error('不能重复指定 --unit-tests')
        if (值 !== 'true' && 值 !== 'false') throw new Error('--unit-tests 必须为 true 或 false')
        结果.运行单测 = 值 === 'true'
        break
      case '--unit-test-filter':
        if (结果.过滤器 !== undefined) throw new Error('不能重复指定 --unit-test-filter')
        new RegExp(值)
        结果.过滤器 = 值
        break
    }
  }
  if (结果.运行单测 === false && 结果.过滤器 !== undefined) throw new Error('跳过单元测试时不能指定 --unit-test-filter')
  return 结果
}

export function 分离发布参数(参数组: readonly string[]): { 版本参数: string[]; 测试参数: string[] } {
  let 版本参数: string[] = []
  let 测试参数: string[] = []
  for (let 索引 = 0; 索引 < 参数组.length; 索引 += 1) {
    let 参数 = 参数组[索引]
    if (参数 === undefined) throw new Error('发布参数索引越界')
    if (参数 === '--unit-tests' || 参数 === '--unit-test-filter') {
      let 值 = 参数组[++索引]
      if (值 === undefined || 值.startsWith('--')) throw new Error(`${参数} 后必须提供值`)
      测试参数.push(参数, 值)
    } else if (参数.startsWith('--unit-tests=') || 参数.startsWith('--unit-test-filter=')) 测试参数.push(参数)
    else 版本参数.push(参数)
  }
  return { 版本参数, 测试参数 }
}
