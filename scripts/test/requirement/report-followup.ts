import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import { 转义Html } from './report-evidence'

let 流程报告Schema = z.object({
  流程名称: z.string().min(1),
  文件: z.string(),
  需求名称们: z.array(z.string()),
  目标验收点名称们: z.array(z.string()),
  目标验收点描述们: z.array(z.string()),
  状态: z.enum(['通过', '失败', '中断', '未执行', '已排除']),
  执行结论: z.object({ 原因: z.string().optional() }).optional(),
  结果来源: z.string().optional(),
})
let 报告Schema = z.object({
  开始时间: z.string(),
  选中流程名称们: z.array(z.string()),
  流程记录们: z.array(流程报告Schema),
})
type 补测报告 = z.infer<typeof 报告Schema>
type 流程定义 = Pick<
  z.infer<typeof 流程报告Schema>,
  '流程名称' | '文件' | '需求名称们' | '目标验收点名称们' | '目标验收点描述们'
>

export async function 验证补测定义(文件: string, 流程们: readonly 流程定义[]): Promise<void> {
  let 报告 = await 读取补测来源(文件)
  let 索引 = new Map(流程们.map((流程) => [流程.流程名称, 流程]))
  let 定义键们: readonly (keyof 流程定义)[] = ['文件', '需求名称们', '目标验收点名称们', '目标验收点描述们']
  for (let 旧流程 of 报告.流程记录们.filter(({ 流程名称 }) => 报告.选中流程名称们.includes(流程名称))) {
    let 新流程 = 索引.get(旧流程.流程名称)
    if (新流程 === undefined || 定义键们.some((键) => JSON.stringify(旧流程[键]) !== JSON.stringify(新流程[键])))
      throw new Error(`补测来源中的流程或验收定义已改变，须重新运行：${旧流程.流程名称}`)
  }
}

export async function 读取补测来源(文件: string): Promise<补测报告> {
  let 报告 = 报告Schema.parse(JSON.parse(await readFile(文件, 'utf8')))
  let 名称们 = 报告.流程记录们.map(({ 流程名称 }) => 流程名称)
  if (new Set(名称们).size !== 名称们.length) throw new Error('补测来源报告含重复流程名称')
  if (
    new Set(报告.选中流程名称们).size !== 报告.选中流程名称们.length ||
    报告.选中流程名称们.some((名称) => 名称们.includes(名称) === false)
  )
    throw new Error('补测来源报告的选中流程名称重复或缺少对应记录')
  return 报告
}

export async function 获得失败流程名称们(文件: string): Promise<readonly string[]> {
  let 报告 = await 读取补测来源(文件)
  return 报告.流程记录们
    .filter(({ 状态, 流程名称 }) => 报告.选中流程名称们.includes(流程名称) && (状态 === '失败' || 状态 === '中断'))
    .map(({ 流程名称 }) => 流程名称)
}

/** 合并仅引用原报告，原始步骤、附件和失败记录均留在原处。 */
export async function 保存补测汇总(来源文件: string, 当前文件: string): Promise<void> {
  let 来源 = await 读取补测来源(来源文件)
  let 当前 = await 读取补测来源(当前文件)
  await 验证补测定义(来源文件, [
    ...来源.流程记录们.filter(({ 流程名称 }) => 当前.选中流程名称们.includes(流程名称) === false),
    ...当前.流程记录们.filter(({ 流程名称 }) => 当前.选中流程名称们.includes(流程名称)),
  ])
  let 当前索引 = new Map(当前.流程记录们.map((流程) => [流程.流程名称, 流程]))
  let 来源索引 = new Map(来源.流程记录们.map((流程) => [流程.流程名称, 流程]))
  for (let 名称 of 当前.选中流程名称们) {
    let 原流程 = 来源索引.get(名称)
    let 新流程 = 当前索引.get(名称)
    if (原流程 === undefined || 新流程 === undefined || 原流程.文件 !== 新流程.文件)
      throw new Error(`补测流程与来源不一致：${名称}`)
  }
  let 目录 = path.dirname(当前文件)
  let 链接 = (文件: string): string =>
    path
      .relative(
        目录,
        path.join(path.dirname(文件), path.basename(文件) === 'combined.json' ? 'combined.html' : 'index.html'),
      )
      .split(path.sep)
      .map(encodeURIComponent)
      .join('/')
  let 流程记录们 = 来源.流程记录们.map((原流程) => {
    let 新流程 = 当前.选中流程名称们.includes(原流程.流程名称) ? 当前索引.get(原流程.流程名称) : undefined
    // 没有执行的补测不覆盖已存在结论，仍清楚显示本次未执行。
    let 采用补测 = 新流程 !== undefined && 新流程.状态 !== '未执行' && 新流程.状态 !== '已排除'
    let 最新流程 = 新流程 !== undefined && 采用补测 ? 新流程 : 原流程
    return {
      ...原流程,
      原状态: 原流程.状态,
      补测状态: 新流程?.状态,
      状态: 最新流程.状态,
      结果来源: 采用补测
        ? 链接(当前文件)
        : 原流程.结果来源 === undefined
          ? 链接(来源文件)
          : path
              .relative(
                目录,
                path.resolve(path.dirname(来源文件), ...原流程.结果来源.split('/').map(decodeURIComponent)),
              )
              .split(path.sep)
              .map(encodeURIComponent)
              .join('/'),
      执行结论: 最新流程.执行结论,
    }
  })
  let 选中流程名称们 = 来源.选中流程名称们
  let 范围 = 流程记录们.filter(({ 流程名称 }) => 选中流程名称们.includes(流程名称))
  let 摘要 = {
    总流程数: 范围.length,
    已执行数: 范围.filter(({ 状态 }) => 状态 === '通过' || 状态 === '失败' || 状态 === '中断').length,
    通过数: 范围.filter(({ 状态 }) => 状态 === '通过').length,
    失败数: 范围.filter(({ 状态 }) => 状态 === '失败').length,
    中断数: 范围.filter(({ 状态 }) => 状态 === '中断').length,
    未执行数: 范围.filter(({ 状态 }) => 状态 === '未执行').length,
  }
  await writeFile(
    path.join(目录, 'combined.json'),
    JSON.stringify({ ...摘要, 开始时间: 来源.开始时间, 选中流程名称们, 流程记录们 }, undefined, 2),
  )
  let 行们 = 范围
    .map(
      (流程) =>
        `<tr><td>${转义Html(流程.流程名称)}</td><td>${流程.原状态}</td><td>${流程.补测状态 ?? '未补测'}</td><td>${流程.状态}</td><td><a href="${转义Html(流程.结果来源)}">查看原始步骤与附件</a></td><td>${转义Html(流程.执行结论?.原因 ?? '')}</td></tr>`,
    )
    .join('')
  let 统计 = Object.entries(摘要)
    .map(([名称, 数量]) => `${名称} ${String(数量)}`)
    .join(' · ')
  await writeFile(
    path.join(目录, 'combined.html'),
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>需求测试补测汇总</title><body><h1>需求测试补测汇总</h1><p>${统计}</p><p>采用各流程最近一次实际执行结果；历史失败记录保留在原报告。<a href="${转义Html(链接(来源文件))}">来源报告</a> · <a href="index.html">本次报告</a></p><table border="1" cellpadding="8"><thead><tr><th>流程</th><th>原状态</th><th>补测状态</th><th>最新状态</th><th>证据</th><th>原因</th></tr></thead><tbody>${行们}</tbody></table></body></html>`,
  )
}
