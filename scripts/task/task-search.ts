import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export type 候选任务项 = { name: string; value: string; description: string; 说明?: string }

let 状态相对路径 = '../../node_modules/.cache/task-state.json'

function 获得状态文件路径(): string {
  return path.resolve(import.meta.dirname, 状态相对路径)
}

/** 读取上次执行成功的任务名称。若缓存不存在或损坏，安全返回 undefined。 */
export async function 读取上次任务(): Promise<string | undefined> {
  try {
    let 文件路径 = 获得状态文件路径()
    let 内容 = await fs.readFile(文件路径, 'utf8')
    let 解析数据 = JSON.parse(内容) as { 上次任务?: unknown }
    if (typeof 解析数据.上次任务 === 'string' && 解析数据.上次任务.trim() !== '') {
      return 解析数据.上次任务.trim()
    }
  } catch {
    // 缓存文件不存在或不可读时静默忽略
  }
  return undefined
}

/** 保存上次选定执行的任务名称。 */
export async function 保存上次任务(任务名称: string): Promise<void> {
  try {
    let 文件路径 = 获得状态文件路径()
    await fs.mkdir(path.dirname(文件路径), { recursive: true })
    let 记录 = { 上次任务: 任务名称, 更新时间: new Date().toISOString() }
    await fs.writeFile(文件路径, JSON.stringify(记录, undefined, 2), 'utf8')
  } catch {
    // 写入失败时静默忽略，不阻碍主任务执行
  }
}

/** 清理标点与特殊符号，仅保留英文字母、数字与中文字符。 */
function 规范化文本(文本: string): string {
  return 文本.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '')
}

/** 检查模式串是否按字符顺序在目标串中作为子序列出现，并计算匹配跨度。 */
function 计算子序列匹配(目标: string, 模式: string): { 匹配: boolean; 跨度: number } {
  if (模式.length === 0) return { 匹配: true, 跨度: 0 }
  let 目标索引 = 0
  let 模式索引 = 0
  let 起始目标索引 = -1
  let 结束目标索引 = -1

  while (目标索引 < 目标.length && 模式索引 < 模式.length) {
    if (目标[目标索引] === 模式[模式索引]) {
      if (模式索引 === 0) 起始目标索引 = 目标索引
      if (模式索引 === 模式.length - 1) 结束目标索引 = 目标索引
      模式索引 += 1
    }
    目标索引 += 1
  }

  if (模式索引 === 模式.length && 起始目标索引 !== -1 && 结束目标索引 !== -1) {
    return { 匹配: true, 跨度: 结束目标索引 - 起始目标索引 + 1 }
  }
  return { 匹配: false, 跨度: 0 }
}

/** 计算单关键词针对候选任务的模糊匹配得分。0 表示不匹配。 */
function 计算单词匹配得分(任务: 候选任务项, 关键词: string): number {
  let 小写关键词 = 关键词.toLowerCase()
  let 规范关键词 = 规范化文本(关键词)
  let 小写任务名 = 任务.value.toLowerCase()
  let 规范任务名 = 规范化文本(任务.value)
  let 小写说明 = `${任务.说明 ?? ''} ${任务.description}`.toLowerCase()
  let 规范说明 = 规范化文本(小写说明)

  // 1. 完全精确相等
  if (小写任务名 === 小写关键词) return 1000

  // 2. 任务名前缀匹配
  if (小写任务名.startsWith(小写关键词)) return 600

  // 3. 任务名连续子串包含
  if (小写任务名.includes(小写关键词)) return 400

  // 4. 去标点连续子串匹配（如 pubdocker 匹配 public:docker:local）
  if (规范关键词 !== '' && 规范任务名.includes(规范关键词)) {
    let 前缀加分 = 规范任务名.startsWith(规范关键词) ? 60 : 0
    return 300 + 前缀加分
  }

  // 5. 分段前缀与首字母缩写匹配（如 pdl 匹配 public:docker:local）
  let 分段列表 = 小写任务名.split(/[:\-_/]+/).filter((段) => 段 !== '')
  let 各段首字母 = 分段列表.map((段) => 段[0] ?? '').join('')
  if (各段首字母 === 规范关键词 && 规范关键词.length >= 2) return 260
  if (各段首字母.startsWith(规范关键词) && 规范关键词.length >= 2) return 220

  // 6. 任务名子序列模糊匹配
  if (规范关键词 !== '') {
    let 子序列结果 = 计算子序列匹配(规范任务名, 规范关键词)
    if (子序列结果.匹配 === true && 子序列结果.跨度 > 0) {
      let 紧凑度 = Math.round((规范关键词.length / 子序列结果.跨度) * 100)
      return 150 + 紧凑度
    }
  }

  // 7. 说明/描述包含匹配
  if (小写说明.includes(小写关键词)) return 80
  if (规范关键词 !== '' && 规范说明.includes(规范关键词)) return 60

  return 0
}

/** 对候选任务列表执行模糊匹配、相关度打分与上次任务置顶排序。 */
export function 模糊过滤并排序任务(参数: {
  候选任务列表: 候选任务项[]
  输入?: string | undefined
  上次任务?: string | undefined
}): 候选任务项[] {
  let 规范输入 = (参数.输入 ?? '').trim()

  // 无搜索输入时：上次运行任务默认排在第 1 位，其余保持原有顺序
  if (规范输入 === '') {
    let 结果列表 = [...参数.候选任务列表]
    if (参数.上次任务 !== undefined) {
      let 上次索引 = 结果列表.findIndex((项) => 项.value === 参数.上次任务)
      if (上次索引 > 0) {
        let [上次项] = 结果列表.splice(上次索引, 1)
        if (上次项 !== undefined) 结果列表.unshift(上次项)
      }
    }
    return 结果列表
  }

  let 关键词列表 = 规范输入
    .split(/\s+/)
    .map((词) => 词.trim())
    .filter((词) => 词 !== '')

  let 匹配结果列表: { 任务: 候选任务项; 总得分: number }[] = []

  for (let 任务 of 参数.候选任务列表) {
    let 当前任务得分 = 0
    let 全部关键词命中 = true

    for (let 关键词 of 关键词列表) {
      let 单词得分 = 计算单词匹配得分(任务, 关键词)
      if (单词得分 <= 0) {
        全部关键词命中 = false
        break
      }
      当前任务得分 += 单词得分
    }

    if (全部关键词命中 === true) {
      if (参数.上次任务 !== undefined && 任务.value === 参数.上次任务) {
        当前任务得分 += 15 // 上次选中的任务在打分相近时优先
      }
      匹配结果列表.push({ 任务, 总得分: 当前任务得分 })
    }
  }

  // 按总得分降序排列
  匹配结果列表.sort((a, b) => b.总得分 - a.总得分)
  return 匹配结果列表.map((项) => 项.任务)
}
