import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect, stripVTControlCharacters } from 'node:util'
import { z } from 'zod'

export type 端到端测试错误详情 = {
  文本: string
  消息?: string
  预期值?: string
  实际值?: string
  位置?: { 行: number; 列: number }
}

let 错误Schema = z.object({
  message: z.string().optional(),
  stack: z.string().optional(),
  matcherResult: z.unknown().optional(),
})

function 格式化值(值: unknown): string {
  return stripVTControlCharacters(inspect(值))
}

function 查找位置(调用栈: string, 用例文件绝对路径: string): 端到端测试错误详情['位置'] {
  for (let 调用帧 of 调用栈.split('\n')) {
    let 匹配 = /^\s*at (?:.* \()?(.+):(\d+):(\d+)\)?$/.exec(调用帧)
    if (匹配 === null) continue
    let [, 文件, 行文本, 列文本] = 匹配
    if (文件 === undefined || 行文本 === undefined || 列文本 === undefined) continue
    if (文件.startsWith('file:')) {
      try {
        文件 = fileURLToPath(文件)
      } catch {
        continue
      }
    }
    if (path.isAbsolute(文件) === false || path.normalize(文件) !== path.normalize(用例文件绝对路径)) continue
    let 行 = Number(行文本)
    let 列 = Number(列文本)
    if (Number.isSafeInteger(行) && 行 > 0 && Number.isSafeInteger(列) && 列 > 0) return { 行, 列 }
  }
  return undefined
}

export function 格式化端到端测试错误(错误: unknown, 用例文件绝对路径: string): 端到端测试错误详情 {
  let 详情: 端到端测试错误详情 = { 文本: 格式化值(错误) }
  let 解析 = 错误Schema.safeParse(错误)
  if (解析.success === false) return 详情
  let { message, stack, matcherResult } = 解析.data
  if (message !== undefined) 详情.消息 = stripVTControlCharacters(message)
  if (stack !== undefined) {
    let 位置 = 查找位置(stripVTControlCharacters(stack), 用例文件绝对路径)
    if (位置 !== undefined) 详情.位置 = 位置
  }
  let 匹配结果 = z.object({ name: z.string(), pass: z.boolean() }).passthrough().safeParse(matcherResult)
  if (匹配结果.success) {
    if (Object.hasOwn(匹配结果.data, 'expected')) 详情.预期值 = 格式化值(匹配结果.data['expected'])
    if (Object.hasOwn(匹配结果.data, 'actual')) 详情.实际值 = 格式化值(匹配结果.data['actual'])
  }
  return 详情
}
