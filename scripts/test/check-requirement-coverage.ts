import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { 流程, 测试模型, 需求, 验收点 } from '../../src/model/requirement-test'
import type { 已审阅的any } from '../../src/tools/types'

let __dirname = path.dirname(fileURLToPath(import.meta.url))
let requirementDir = path.resolve(__dirname, '../../test/requirement')
let files = await fs.readdir(requirementDir, { recursive: true })
let modelFiles = files.filter((f) => f.endsWith('-model.ts'))

let 所有模型: 测试模型<已审阅的any, 已审阅的any>[] = []
for (let file of modelFiles) {
  let filePath = path.join(requirementDir, file)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  let 模块 = await import(pathToFileURL(filePath).href)
  for (let 导出成员 of Object.values(模块 as Record<string, 已审阅的any>)) {
    if (导出成员 instanceof 测试模型) {
      所有模型.push(导出成员)
    }
  }
}

let 所有验收点: 验收点<已审阅的any>[] = []
let 所有需求: 需求<已审阅的any>[] = []
let 所有流程: 流程<已审阅的any, 已审阅的any>[] = []

for (let 模型 of 所有模型) {
  模型.检查()
  所有需求.push(...模型.需求们)
  所有流程.push(...模型.流程们)
  所有验收点.push(...模型.需求们.flatMap((需求: 需求<已审阅的any>) => [...需求.验收点们]))
}

let 已覆盖验收点集 = new Set(所有流程.flatMap((流程) => [...流程.覆盖验收点们]))
let 未覆盖验收点们 = 所有验收点.filter((验收点) => !已覆盖验收点集.has(验收点))
if (未覆盖验收点们.length > 0)
  throw new Error(`存在未被流程覆盖的验收点：${未覆盖验收点们.map((验收点) => 验收点.描述).join('、')}`)

console.log(
  `需求覆盖完整：发现 ${所有模型.length} 个模型，包含 ${所有需求.length} 个需求的 ${所有验收点.length} 个验收点，由 ${所有流程.length} 个可运行流程覆盖。`,
)
