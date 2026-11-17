import SQLite from 'node-sqlite3-wasm'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { 注册测试工具, type MCP测试工具宿主 } from '../../scripts/test/mcp/tools'
import { 生成需求测试代码 } from '../../scripts/test/requirement/export-operation-record'
import type { 需求测试工具 } from '../../src/model/test-requirement'
import { 需求测试数据库 } from '../../src/test-tools/database'
import { 测试操作记录 } from '../../src/test-tools/operation-record'

let 环境 = vi.hoisted(() => ({ NODE_ENV: 'test', DB_PATH: '' }))
vi.mock('../../src/global/env', () => ({ 获得环境变量: (): typeof 环境 => 环境 }))

let 执行命令 = promisify(execFile)
let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 目录 = ''
let 数据库 = new 需求测试数据库(tmpdir())
let 无记录 = (): void => {}

/** 只在临时目录里新建一个全新的 SQLite 文件，绝不碰项目里已有的库。 */
function 建表(库路径: string): void {
  let 库 = new SQLite.Database(库路径)
  try {
    库.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 1, data BLOB);
      CREATE TABLE child (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER NOT NULL REFERENCES parent(id) ON DELETE CASCADE,
        day TEXT NOT NULL
      );
    `)
  } finally {
    库.close()
  }
}

beforeAll(async () => {
  目录 = await mkdtemp(path.join(tmpdir(), 'database-write-'))
})

afterAll(async () => {
  数据库.关闭()
  await rm(目录, { recursive: true, force: true })
})

beforeEach(() => {
  数据库.关闭()
  环境.NODE_ENV = 'test'
  环境.DB_PATH = path.join(目录, `${String(Math.random()).slice(2)}.db`)
  建表(环境.DB_PATH)
  数据库 = new 需求测试数据库(目录)
})

describe('测试数据库可写', () => {
  it('写入后能查到，并返回受影响行数和自增编号', () => {
    let 插入 = 数据库.执行('INSERT INTO parent (name, level) VALUES (?, ?)', ['甲', 3], 无记录)
    expect(插入).toEqual({ 影响行数: 1, 最后插入编号: 1 })
    数据库.执行('INSERT INTO child (parent_id, day) VALUES (?, ?)', [1, '2026-01-01'], 无记录)
    expect(数据库.查询('SELECT name, level FROM parent', [], ['name', 'level'], 无记录)).toEqual([
      { name: '甲', level: 3 },
    ])
    expect(数据库.执行('UPDATE parent SET level = ? WHERE id = ?', [9, 1], 无记录)).toEqual({
      影响行数: 1,
      最后插入编号: undefined,
    })
    expect(数据库.执行('DELETE FROM parent WHERE id = ?', [404], 无记录).影响行数).toBe(0)
  })

  it('支持 bigint 与二进制参数，失败时报错并留下记录', () => {
    let 文本们: string[] = []
    数据库.执行('INSERT INTO parent (name, data) VALUES (?, ?)', ['乙', Buffer.from('abc')], (生成): void => {
      文本们.push(生成())
    })
    expect(数据库.查询('SELECT data FROM parent', [], [], 无记录)[0]?.['data']).toEqual(
      new Uint8Array(Buffer.from('abc')),
    )
    expect(() =>
      数据库.执行('INSERT INTO parent (name) VALUES (?)', [null], (生成): void => void 文本们.push(生成())),
    ).toThrow()
    expect(文本们[0]).toContain('影响 1 行')
    expect(文本们[1]).toContain('写入失败')
  })

  it('只允许测试环境，重置连接后仍能继续写入', () => {
    数据库.执行('INSERT INTO parent (name) VALUES (?)', ['丙'], 无记录)
    数据库.重置连接()
    数据库.执行('INSERT INTO parent (name) VALUES (?)', ['丁'], 无记录)
    expect(数据库.查询('SELECT COUNT(*) AS n FROM parent', [], ['n'], 无记录)).toEqual([{ n: 2 }])
    环境.NODE_ENV = 'production'
    数据库.重置连接()
    expect(() => 数据库.执行('INSERT INTO parent (name) VALUES (?)', ['戊'], 无记录)).toThrow('只允许操作测试环境')
  })

  it('只读连接等待其他进程释放写锁，重置后仍能等待', async () => {
    数据库.执行('INSERT INTO parent (name) VALUES (?)', ['初始'], 无记录)
    let 验证等待 = async (新名字: string): Promise<void> => {
      let 子进程 = spawn(
        process.execPath,
        [
          '-e',
          `let SQLite = require('node-sqlite3-wasm'); let db = new SQLite.Database(process.argv[1]);
          db.exec('BEGIN EXCLUSIVE'); db.run('UPDATE parent SET name = ?', [process.argv[2]]);
          process.stdout.write('locked'); setTimeout(() => { db.exec('COMMIT'); db.close() }, 300);`,
          环境.DB_PATH,
          新名字,
        ],
        { cwd: 项目根目录, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      )
      let 退出 = new Promise<number | null>((完成): void => {
        子进程.once('exit', (退出码): void => 完成(退出码))
      })
      try {
        await Promise.race([
          once(子进程.stdout, 'data'),
          退出.then((): never => {
            throw new Error('写锁子进程提前退出')
          }),
        ])
        expect(数据库.查询('SELECT name FROM parent', [], ['name'], 无记录)).toEqual([{ name: 新名字 }])
        expect(await 退出).toBe(0)
      } finally {
        if (子进程.exitCode === null && 子进程.signalCode === null) 子进程.kill()
      }
    }
    // 提前建立只读连接，确保验证的是已打开连接与重建连接的并发行为。
    数据库.查询('SELECT name FROM parent', [], [], 无记录)
    await 验证等待('第一次')
    数据库.重置连接()
    await 验证等待('重建后')
  })

  it('表结构返回列和外键，可只看部分表', () => {
    let 全部 = 数据库.表结构()
    expect(全部.map(({ 表 }) => 表)).toEqual(['child', 'parent'])
    let 子表 = 全部[0]
    expect(子表?.列们).toEqual([
      { 列: 'id', 类型: 'INTEGER', 非空: false, 主键序号: 1, 默认值: null },
      { 列: 'parent_id', 类型: 'INTEGER', 非空: true, 主键序号: 0, 默认值: null },
      { 列: 'day', 类型: 'TEXT', 非空: true, 主键序号: 0, 默认值: null },
    ])
    expect(子表?.外键们).toEqual([
      { 列: 'parent_id', 引用表: 'parent', 引用列: 'id', 更新时: 'NO ACTION', 删除时: 'CASCADE' },
    ])
    let [父表] = 数据库.表结构(['parent'])
    expect(父表?.列们.find(({ 列 }) => 列 === 'level')).toMatchObject({ 非空: true, 默认值: '1' })
    expect(父表?.外键们).toEqual([])
    expect(() => 数据库.表结构(['不存在'])).toThrow('不存在')
  })
})

type 处理函数 = (参数: unknown, 上下文: { mcpReq: { signal: AbortSignal } }) => Promise<{ structuredContent: unknown }>

/** 用真实的 MCP 注册函数、真实的操作记录和测试库，走一遍「录制 → 导出」。 */
async function 搭建录制(): Promise<{ 调用: (名称: string, 参数: unknown) => Promise<unknown>; 记录: 测试操作记录 }> {
  let 处理们 = new Map<string, { 处理: 处理函数; 参数模型: { parse: (值: unknown) => unknown } }>()
  let 假服务 = {
    registerTool: (名称: string, 配置: { inputSchema: { parse: (值: unknown) => unknown } }, 处理: 处理函数): void => {
      处理们.set(名称, { 处理, 参数模型: 配置.inputSchema })
    },
  }
  let 记录目录 = await mkdtemp(path.join(目录, 'record-'))
  let 记录 = new 测试操作记录(记录目录)
  await 记录.初始化()
  let 工具 = {
    取消信号: new AbortController().signal,
    数据库: {
      查询: (语句: string, 参数 = [], 报告列 = []) => 数据库.查询(语句, 参数, 报告列, 无记录),
      执行: (语句: string, 参数 = []) => 数据库.执行(语句, 参数, 无记录),
      表结构: (表们?: readonly string[]) => 数据库.表结构(表们),
    },
  } as unknown as 需求测试工具
  let 宿主: MCP测试工具宿主 = {
    操作记录: 记录,
    执行工具: async (执行) => await 执行(),
    重置数据库: async () => {
      数据库.重置连接()
      return { reset: true, recordCleared: false }
    },
    执行: async (执行) => ({ 结果: { 成功: true, 值: await 执行(工具, 无记录) }, 附件们: [], 取证错误们: [] }),
    获得测试地址: () => ({ 前端: 'http://localhost', 后端: 'http://localhost' }),
    获得设备: () => ({ 安卓: undefined, 苹果: undefined }),
    读取后端日志: () => ({ 标准输出: '', 错误输出: '' }),
    获得输出目录: () => 记录目录,
  }
  注册测试工具(假服务 as never, 宿主)
  return {
    记录,
    调用: async (名称, 参数): Promise<unknown> => {
      let 工具项 = 处理们.get(名称)
      if (工具项 === undefined) throw new Error(`没有注册工具 ${名称}`)
      let { structuredContent } = await 工具项.处理(工具项.参数模型.parse(参数), {
        mcpReq: { signal: new AbortController().signal },
      })
      return structuredContent
    },
  }
}

let 说明 = { 测试思路: undefined, 结论补充: undefined }
let 测试地址 = { 前端: 'http://localhost', 后端: 'http://localhost' }
let 导航参数 = { name: 'a', url: 'http://localhost/', timeoutMs: 5000, observe: false, observation: 'none' }

function 导出(步骤组: Awaited<ReturnType<测试操作记录['准备导出']>>, 源码目录路径 = '../../../src'): string {
  return 生成需求测试代码({
    ...说明,
    需求模块路径: './index.requirement',
    源码目录路径,
    覆盖验收点键们: ['验收'],
    流程名称: '造数据',
    步骤组,
    测试地址,
  })
}

describe('录制与导出', () => {
  it('database_reset 不进录制，database_schema 不进录制，database_execute 进录制', async () => {
    let { 调用, 记录 } = await 搭建录制()
    await 调用('database_reset', {})
    let 表结构 = (await 调用('database_schema', { tables: ['child'] })) as {
      result: { tables: { foreignKeys: unknown[] }[] }
    }
    expect(表结构.result.tables[0]?.foreignKeys).toHaveLength(1)
    expect(await 记录.列出(0, 50, {})).toMatchObject({ total: 0 })
    let 写入 = (await 调用('database_execute', {
      sql: 'INSERT INTO parent (name) VALUES (?)',
      parameters: ['甲'],
    })) as { recordId: number; result: unknown }
    expect(写入.result).toEqual({ changes: 1, lastInsertRowid: 1 })
    expect(await 记录.获得(写入.recordId)).toMatchObject({ kind: 'call', tool: 'database_execute', status: 'passed' })
  })

  it('界面操作前的写入进初始化，之后的写入成为行为步骤，生成的代码能通过类型检查', async () => {
    let { 调用, 记录 } = await 搭建录制()
    await 调用('database_reset', {})
    let 第一条 = (await 调用('database_execute', {
      sql: 'INSERT INTO parent (name, level, data) VALUES (?, ?, ?)',
      parameters: [
        '甲',
        { type: 'bigint', value: '5' },
        { type: 'blob', value: Buffer.from('abc').toString('base64') },
      ],
    })) as { recordId: number }
    let 第二条 = (await 调用('database_execute', {
      sql: 'INSERT INTO child (parent_id, day) VALUES (?, ?)',
      parameters: [1, '2026-01-01'],
    })) as { recordId: number }
    let 界面 = await 记录.开始('browser_navigate', 导航参数)
    await 记录.完成(界面, { status: 'passed', result: { url: 'http://localhost/' }, artifacts: [], evidenceErrors: [] })
    let 界面后 = (await 调用('database_execute', {
      sql: 'UPDATE parent SET level = ? WHERE id = ?',
      parameters: [7, 1],
    })) as { recordId: number }
    let 查询 = (await 调用('database_query', { sql: 'SELECT level FROM parent', parameters: [] })) as {
      recordId: number
    }
    let 断言 = await 记录.添加断言(查询.recordId, ['rows', 0, 'level'], 7, {})
    let 写入断言 = await 记录.添加断言(第一条.recordId, ['changes'], 1, {})

    let 步骤组 = await 记录.准备导出([
      { 名称: '准备数据', 条目编号们: [第一条.recordId, 第二条.recordId] },
      { 名称: '打开页面', 条目编号们: [界面] },
      { 名称: '界面后改数据', 条目编号们: [界面后.recordId] },
      { 名称: '核对', 条目编号们: [查询.recordId, 断言, 写入断言] },
    ])
    let 代码 = 导出(步骤组)

    expect(代码).toContain('初始化: (工具): 测试上下文 => {')
    let 初始化 = 代码.slice(代码.indexOf('初始化:'), 代码.indexOf('名称:'))
    expect(初始化).toContain('INSERT INTO parent (name, level, data) VALUES (?, ?, ?)')
    expect(初始化).toContain('BigInt("5")')
    expect(初始化).toContain('Buffer.from("YWJj", \'base64\')')
    expect(初始化).toContain('INSERT INTO child')
    expect(初始化).toContain(`当前状态.结果们.set(${String(第一条.recordId)}, 整理数据库写入结果(`)
    expect(初始化).not.toContain('UPDATE parent')
    expect(代码).not.toContain('new 行为<测试上下文>("准备数据"')
    expect(代码).toContain('new 行为<测试上下文>("界面后改数据"')
    expect(代码).toContain('UPDATE parent SET level = ? WHERE id = ?')
    expect(代码).toContain('整理数据库写入结果')

    // 生成的流程写到仓库内的临时目录，用 tsc 检查类型（输出目录已被 git 忽略）
    let 输出 = await mkdtemp(path.join(项目根目录, 'test-outputs/database-write-'))
    try {
      await mkdir(输出, { recursive: true })
      let 源码路径 = path.relative(输出, path.join(项目根目录, 'src')).replaceAll('\\', '/')
      await writeFile(path.join(输出, 'flow.ts'), 导出(步骤组, 源码路径))
      await writeFile(
        path.join(输出, 'index.requirement.ts'),
        `import { 需求, 验收点 } from '${源码路径}/model/test-requirement'\nexport let 验收点们 = { 验收: new 验收点({ 名称: '验收', 描述: '验收' }) }\nexport let 业务需求 = new 需求({ 名称: '需求', 描述: '测试', 验收点们: Object.values(验收点们) })\n`,
      )
      await writeFile(
        path.join(输出, 'tsconfig.json'),
        JSON.stringify({ extends: path.join(项目根目录, 'tsconfig.json'), include: ['./*.ts'], exclude: [] }),
      )
      await 执行命令(
        process.execPath,
        [path.join(项目根目录, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', path.join(输出, 'tsconfig.json')],
        { cwd: 项目根目录 },
      )
    } finally {
      await rm(输出, { recursive: true, force: true })
    }
  }, 180_000)

  it('界面操作前但排在其他操作之后的写入保持原顺序，成为行为步骤', async () => {
    let { 调用, 记录 } = await 搭建录制()
    let 前 = (await 调用('database_execute', { sql: 'INSERT INTO parent (name) VALUES (?)', parameters: ['甲'] })) as {
      recordId: number
    }
    let 查询 = (await 调用('database_query', { sql: 'SELECT COUNT(*) AS n FROM parent', parameters: [] })) as {
      recordId: number
    }
    let 后 = (await 调用('database_execute', { sql: 'INSERT INTO parent (name) VALUES (?)', parameters: ['乙'] })) as {
      recordId: number
    }
    let 断言 = await 记录.添加断言(查询.recordId, ['rows', 0, 'n'], 1, {})
    let 代码 = 导出(
      await 记录.准备导出([
        { 名称: '先造一条', 条目编号们: [前.recordId] },
        { 名称: '数一数', 条目编号们: [查询.recordId, 断言] },
        { 名称: '再造一条', 条目编号们: [后.recordId] },
      ]),
    )
    let 初始化 = 代码.slice(代码.indexOf('初始化:'), 代码.indexOf('名称:'))
    expect(初始化).toContain('"甲"')
    expect(初始化).not.toContain('"乙"')
    expect(代码).toContain('new 行为<测试上下文>("再造一条"')
    expect(代码.indexOf('SELECT COUNT')).toBeLessThan(代码.indexOf('"乙"'))
  })

  it('进初始化的写入带决策说明时报错并指出操作编号', async () => {
    let { 调用, 记录 } = await 搭建录制()
    let 前 = (await 调用('database_execute', { sql: 'INSERT INTO parent (name) VALUES (?)', parameters: ['甲'] })) as {
      recordId: number
    }
    await 记录.更新说明(前.recordId, undefined, '造一个父记录')
    let 查询 = (await 调用('database_query', { sql: 'SELECT COUNT(*) AS n FROM parent', parameters: [] })) as {
      recordId: number
    }
    let 断言 = await 记录.添加断言(查询.recordId, ['rows', 0, 'n'], 1, {})
    let 步骤组 = await 记录.准备导出([
      { 名称: '造数据', 条目编号们: [前.recordId] },
      { 名称: '核对', 条目编号们: [查询.recordId, 断言] },
    ])
    expect(() => 导出(步骤组)).toThrow(`操作 ${String(前.recordId)} 排在界面操作之前`)
  })
})
