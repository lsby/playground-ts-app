import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { 浏览器测试引擎, type 浏览器步骤证据, type 浏览器测试模式 } from '../../../src/model/browser-test'
import type { 端到端测试, 端到端测试步骤 } from '../../../src/model/test-e2e'
import { 格式化端到端测试错误, type 端到端测试错误详情 } from './format-error'

export type 端到端测试登记 = { 文件: string; 类: new () => 端到端测试 }
type 测试附件 = { 名称: string; 相对路径: string; 内容类型: string }
type 步骤标识 = Pick<端到端测试步骤, '名称' | '类型'>
type 步骤证据记录 = Pick<浏览器步骤证据, '阶段' | '名称'> & { 相对路径: string }
type 步骤执行结果 = { 状态: '通过' } | { 状态: '失败' | '中断'; 错误: 端到端测试错误详情 }
type 步骤记录 = 步骤标识 &
  (
    | { 状态: '未执行' }
    | (步骤执行结果 & { 耗时毫秒: number; 证据们?: readonly 步骤证据记录[]; 取证错误们?: readonly string[] })
  )

export type 执行结果 = {
  名称: string
  文件: string
  状态: '通过' | '失败' | '中断'
  尝试序号: number
  耗时毫秒: number
  错误们: string[]
  附件们: 测试附件[]
  步骤们: 步骤记录[]
}

type 尝试参数 = {
  根目录: string
  服务地址: string
  模式: 浏览器测试模式
  尝试序号: number
  本次报告目录: string
  取消信号: AbortSignal
}

async function 执行步骤(
  引擎: 浏览器测试引擎,
  步骤们: readonly 端到端测试步骤[],
  步骤记录们: 步骤记录[],
  参数: { 用例文件: string; 报告目录: string; 附件目录: string; 取消信号: AbortSignal },
): Promise<string | undefined> {
  for (let [序号, { 名称, 类型, 执行 }] of 步骤们.entries()) {
    参数.取消信号.throwIfAborted()
    let 证据目录 = path.join(参数.附件目录, 'steps', String(序号 + 1))
    let 已分配序号 = 0
    let 证据索引 = new Map<number, 步骤证据记录>()
    let 取证错误们: string[] = []
    let 提交 = async ({ 阶段, 名称, 图片 }: 浏览器步骤证据): Promise<void> => {
      已分配序号 += 1
      let 证据序号 = 已分配序号
      let 文件 = path.join(证据目录, `${String(证据序号)}.png`)
      await mkdir(证据目录, { recursive: true })
      await writeFile(文件, 图片)
      证据索引.set(证据序号, { 阶段, 名称, 相对路径: 相对报告路径(参数.报告目录, 文件) })
    }
    let 记录错误 = (错误: unknown): void => {
      取证错误们.push(格式化端到端测试错误(错误, 参数.用例文件).文本)
    }
    let 结果: 步骤执行结果
    let 开始时间 = performance.now()
    try {
      await 引擎.记录步骤证据({ 提交, 记录错误 }, () => 执行(引擎))
      结果 = { 状态: '通过' }
    } catch (错误) {
      结果 = { 状态: 参数.取消信号.aborted ? '中断' : '失败', 错误: 格式化端到端测试错误(错误, 参数.用例文件) }
    }
    let 证据们 = [...证据索引].sort(([左], [右]) => 左 - 右).map(([, 证据]) => 证据)
    步骤记录们[序号] = {
      名称,
      类型,
      ...结果,
      耗时毫秒: Math.round(performance.now() - 开始时间),
      ...(证据们.length === 0 ? {} : { 证据们 }),
      ...(取证错误们.length === 0 ? {} : { 取证错误们 }),
    }
    if ('错误' in 结果) return 结果.错误.文本
  }
  参数.取消信号.throwIfAborted()
  return undefined
}

function 相对报告路径(报告目录: string, 文件: string): string {
  return path.relative(报告目录, 文件).replaceAll('\\', '/')
}

export async function 执行端到端测试尝试(测试: 端到端测试登记, 参数: 尝试参数): Promise<执行结果> {
  let 开始时间 = performance.now()
  let 用例文件 = path.join(参数.根目录, 'test/e2e', 测试.文件)
  let 错误文本 = (错误: unknown): string => 格式化端到端测试错误(错误, 用例文件).文本
  let 错误们: string[] = []
  let 附件们: 测试附件[] = []
  let 步骤记录们: 步骤记录[] = []
  console.log(`开始端到端测试：${测试.类.name}（${测试.文件}，第 ${String(参数.尝试序号)} 次）`)
  try {
    let 步骤们 = new 测试.类().获得执行步骤()
    步骤记录们 = 步骤们.map(({ 名称, 类型 }) => ({ 名称, 类型, 状态: '未执行' }))
    let 附件目录 = path.join(参数.本次报告目录, 'attachments', 测试.文件, String(参数.尝试序号))
    let 会话 = await 浏览器测试引擎.打开会话({
      服务地址: 参数.服务地址,
      模式: 参数.模式,
      取消信号: 参数.取消信号,
      附件目录,
    })
    try {
      let 步骤错误 = await 执行步骤(会话.引擎, 步骤们, 步骤记录们, {
        用例文件,
        报告目录: 参数.本次报告目录,
        附件目录,
        取消信号: 参数.取消信号,
      })
      if (步骤错误 !== undefined) 错误们.push(步骤错误)
    } catch (错误) {
      错误们.push(错误文本(错误))
    } finally {
      try {
        if (参数.取消信号.aborted === false) {
          附件们 = (await 会话.收集附件()).map((附件) => ({
            名称: 附件.名称,
            相对路径: 相对报告路径(参数.本次报告目录, 附件.路径),
            内容类型: 附件.内容类型,
          }))
        }
      } catch (错误) {
        错误们.push(`收集浏览器附件失败：${错误文本(错误)}`)
      } finally {
        await 会话.关闭()
      }
    }
  } catch (错误) {
    错误们.push(错误文本(错误))
  }
  let 状态: 执行结果['状态'] = 参数.取消信号.aborted ? '中断' : 错误们.length === 0 ? '通过' : '失败'
  if (错误们.length > 0) console.error(错误们.join('\n'))
  console.log(`${测试.类.name}：${状态}`)
  return {
    名称: 测试.类.name,
    文件: 测试.文件,
    状态,
    尝试序号: 参数.尝试序号,
    耗时毫秒: Math.round(performance.now() - 开始时间),
    错误们,
    附件们,
    步骤们: 步骤记录们,
  }
}
