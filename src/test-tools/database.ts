import SQLite from 'node-sqlite3-wasm'
import { resolve } from 'node:path'
import { z } from 'zod'

import { 获得环境变量 } from '../global/env'
import type { 测试数据库值 } from '../model/test-requirement'

let 查询结果模型 = z.array(z.record(z.union([z.string(), z.number(), z.bigint(), z.instanceof(Uint8Array), z.null()])))

/** 用独立的只读连接观察测试数据库，并为查询保留有限的报告内容。 */
export class 需求测试数据库 {
  private 数据库: SQLite.Database | undefined
  private 已关闭 = false

  public constructor(private readonly 项目根目录: string) {}

  public 查询(
    语句: string,
    参数: readonly 测试数据库值[],
    报告列: readonly string[],
    记录: (生成文本: () => string) => void,
  ): Record<string, 测试数据库值>[] {
    if (this.已关闭) throw new Error('测试数据库已关闭')
    let 查询 = z.string().trim().min(1).parse(语句).replace(/;$/, '')
    let 描述 = `SQL\n${查询}\n参数：${String(参数.length)} 项（已隐藏）`
    let 结果: Record<string, 测试数据库值>[]
    try {
      let 配置 = 获得环境变量()
      if (配置.NODE_ENV !== 'test') throw new Error('需求测试只允许查询测试环境的数据库')
      this.数据库 ??= new SQLite.Database(resolve(this.项目根目录, 配置.DB_PATH), { readOnly: true })
      // 只执行能够作为表来源的查询，并由 SQLite 连接强制保护数据库文件。
      结果 = 查询结果模型.parse(this.数据库.all(`SELECT * FROM (${查询}\n)`, [...参数]))
    } catch (错误) {
      记录(() => `${描述}\n查询失败`)
      throw 错误
    }
    记录(() => `${描述}\n${this.格式化结果(结果, 报告列)}`)
    return 结果
  }

  public 关闭(): void {
    this.已关闭 = true
    this.重置连接()
  }

  public 重置连接(): void {
    this.数据库?.close()
    this.数据库 = undefined
  }

  private 格式化结果(结果: readonly Record<string, 测试数据库值>[], 报告列: readonly string[]): string {
    let 预览 = 结果
      .slice(0, 20)
      .map((行) =>
        Object.fromEntries(
          Object.entries(行).map(([列, 值]) => [列, 报告列.includes(列) ? this.格式化值(值) : '已隐藏']),
        ),
      )
    return `查询结果 ${String(结果.length)} 行，展示 ${String(预览.length)} 行\n${JSON.stringify(预览, undefined, 2)}`
  }

  private 格式化值(值: 测试数据库值): string | number | null {
    if (值 instanceof Uint8Array) return `二进制（${String(值.byteLength)} 字节）`
    if (typeof 值 === 'bigint') return 值.toString()
    if (typeof 值 === 'string' && 值.length > 256) return `${值.slice(0, 256)}…`
    return 值
  }
}
