import SQLite from 'node-sqlite3-wasm'
import { resolve } from 'node:path'
import { z } from 'zod'

import { 获得环境变量 } from '../global/env'
import type { 测试数据库值, 测试数据库写入结果, 测试数据库表结构 } from '../model/test-requirement'

let 查询结果模型 = z.array(z.record(z.union([z.string(), z.number(), z.bigint(), z.instanceof(Uint8Array), z.null()])))

let 表名结果模型 = z.array(z.object({ name: z.string() }))
let 列结果模型 = z.array(
  z.object({
    name: z.string(),
    type: z.string(),
    notnull: z.number(),
    dflt_value: z.string().nullable(),
    pk: z.number(),
  }),
)
let 外键结果模型 = z.array(
  z.object({
    id: z.number(),
    seq: z.number(),
    table: z.string(),
    from: z.string(),
    to: z.string().nullable(),
    on_update: z.string(),
    on_delete: z.string(),
  }),
)
let 忙等待毫秒 = 5000

/** 用只读连接观察测试数据库，用独立的写入连接造数据；两者都只允许在测试环境使用。 */
export class 需求测试数据库 {
  private 数据库: SQLite.Database | undefined
  private 写入数据库: SQLite.Database | undefined
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
      结果 = 查询结果模型.parse(this.获得只读连接().all(`SELECT * FROM (${查询}\n)`, [...参数]))
    } catch (错误) {
      记录(() => `${描述}\n查询失败`)
      throw 错误
    }
    记录(() => `${描述}\n${this.格式化结果(结果, 报告列)}`)
    return 结果
  }

  /** 执行一条写语句（INSERT、UPDATE、DELETE 等），返回受影响行数；语句和参数必须是确定的，回放才会与录制一致。 */
  public 执行(语句: string, 参数: readonly 测试数据库值[], 记录: (生成文本: () => string) => void): 测试数据库写入结果 {
    if (this.已关闭) throw new Error('测试数据库已关闭')
    let 写入 = z.string().trim().min(1).parse(语句).replace(/;$/, '')
    let 描述 = `SQL\n${写入}\n参数：${String(参数.length)} 项（已隐藏）`
    let 结果: 测试数据库写入结果
    try {
      let 数据库 = this.获得写入连接()
      let { changes, lastInsertRowid } = 数据库.run(写入, [...参数])
      // lastInsertRowid 是连接上一次插入的编号，只有本条是插入语句时才有意义。
      结果 = { 影响行数: changes, 最后插入编号: /^\s*(?:insert|replace)\b/i.test(写入) ? lastInsertRowid : undefined }
    } catch (错误) {
      记录(() => `${描述}\n写入失败`)
      throw 错误
    }
    记录(
      () =>
        `${描述}\n影响 ${String(结果.影响行数)} 行${结果.最后插入编号 === undefined ? '' : `，最后插入编号 ${String(结果.最后插入编号)}`}`,
    )
    return 结果
  }

  /** 读取测试库的真实表结构；传入 表们 时只返回这些表，不存在的表会报错。 */
  public 表结构(表们?: readonly string[]): 测试数据库表结构[] {
    if (this.已关闭) throw new Error('测试数据库已关闭')
    let 数据库 = this.获得只读连接()
    let 全部表 = 表名结果模型
      .parse(
        数据库.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"),
      )
      .map(({ name }) => name)
    let 缺少的表 = (表们 ?? []).filter((表) => 全部表.includes(表) === false)
    if (缺少的表.length > 0) throw new Error(`测试数据库没有这些表：${缺少的表.join('、')}`)
    return 全部表
      .filter((表) => 表们 === undefined || 表们.includes(表))
      .map((表) => ({
        表,
        列们: 列结果模型
          .parse(数据库.all('SELECT * FROM pragma_table_info(?) ORDER BY cid', [表]))
          .map((列) => ({
            列: 列.name,
            类型: 列.type,
            非空: 列.notnull === 1,
            主键序号: 列.pk,
            默认值: 列.dflt_value,
          })),
        外键们: 外键结果模型
          .parse(数据库.all('SELECT * FROM pragma_foreign_key_list(?) ORDER BY id, seq', [表]))
          .map((键) => ({ 列: 键.from, 引用表: 键.table, 引用列: 键.to, 更新时: 键.on_update, 删除时: 键.on_delete })),
      }))
  }

  public 关闭(): void {
    this.已关闭 = true
    this.重置连接()
  }

  public 重置连接(): void {
    try {
      this.数据库?.close()
    } finally {
      this.数据库 = undefined
      try {
        this.写入数据库?.close()
      } finally {
        this.写入数据库 = undefined
      }
    }
  }

  private 获得数据库路径(): string {
    let 配置 = 获得环境变量()
    if (配置.NODE_ENV !== 'test') throw new Error('需求测试只允许操作测试环境的数据库')
    return resolve(this.项目根目录, 配置.DB_PATH)
  }

  private 获得只读连接(): SQLite.Database {
    // 只执行能够作为表来源的查询，并由 SQLite 连接强制保护数据库文件。
    if (this.数据库 !== undefined) return this.数据库
    let 数据库 = new SQLite.Database(this.获得数据库路径(), { readOnly: true })
    try {
      数据库.exec(`PRAGMA busy_timeout = ${String(忙等待毫秒)};`)
    } catch (错误) {
      数据库.close()
      throw 错误
    }
    this.数据库 = 数据库
    return 数据库
  }

  private 获得写入连接(): SQLite.Database {
    if (this.写入数据库 !== undefined) return this.写入数据库
    // 后端进程可能同时持有锁，写入要等一等而不是立刻失败。
    let 数据库 = new SQLite.Database(this.获得数据库路径(), { fileMustExist: true })
    try {
      数据库.exec(`PRAGMA busy_timeout = ${String(忙等待毫秒)};`)
    } catch (错误) {
      数据库.close()
      throw 错误
    }
    this.写入数据库 = 数据库
    return 数据库
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
