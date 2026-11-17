import { Linter } from 'eslint'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { format } from 'prettier'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import 浏览器回调规则 from '../../scripts/eslint/rule/no-browser-named-callback.js'
import { 生成需求测试代码 } from '../../scripts/test/requirement/export-operation-record'
import { 拆分需求测试源码 } from '../../scripts/test/requirement/export-split'
import { 格式化需求测试错误 } from '../../scripts/test/requirement/format-error'
import { 保存补测汇总, 获得失败流程名称们 } from '../../scripts/test/requirement/report-followup'
import { 需求测试运行器 } from '../../scripts/test/requirement/run-requirement'
import { 检查需求源码版本 } from '../../scripts/test/requirement/source-version'
import { 创建测试子进程环境, 检查测试命令环境 } from '../../scripts/test/test-environment'
import type { 导出回放步骤, 操作调用条目 } from '../../src/model/test-requirement/recording'

vi.mock('../../src/global/env', () => ({
  获得环境变量: (): never => {
    throw new Error('本测试不使用后端环境')
  },
}))

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 临时目录们: string[] = []
let 执行文件 = promisify(execFile)

async function 新目录(): Promise<string> {
  let 目录 = await mkdtemp(path.join(tmpdir(), 'requirement-framework-'))
  临时目录们.push(目录)
  return 目录
}

afterAll(async (): Promise<void> => {
  for (let 目录 of 临时目录们) await rm(目录, { recursive: true, force: true })
})

describe('已加载需求源码的修改检查', () => {
  it.each(['test/requirement', 'test/requirement-support'])(
    '修改 %s 中的旧文件要求重启，新增文件可继续发现',
    async (相对目录): Promise<void> => {
      let 根目录 = await 新目录()
      let 目录 = path.join(根目录, 相对目录)
      await mkdir(目录, { recursive: true })
      let 文件 = path.join(目录, 'flow.ts')
      await writeFile(文件, 'export let 值 = 1')
      await 检查需求源码版本(根目录)
      await writeFile(path.join(目录, 'new-flow.ts'), 'export let 新值 = 1')
      await expect(检查需求源码版本(根目录)).resolves.toBeUndefined()
      await writeFile(文件, 'export let 值 = 2')
      await expect(检查需求源码版本(根目录)).rejects.toThrow(/flow\.ts|重启/u)
    },
  )

  it('已登记的辅助文件被删除时拒绝继续使用旧模块', async (): Promise<void> => {
    let 根目录 = await 新目录()
    let 目录 = path.join(根目录, 'test/requirement-support')
    await mkdir(目录, { recursive: true })
    let 文件 = path.join(目录, 'helper.ts')
    await writeFile(文件, 'export let 数据 = 1')
    await 检查需求源码版本(根目录)
    await rm(文件)
    await expect(检查需求源码版本(根目录)).rejects.toThrow(/重启/u)
  })
})

describe('测试子进程环境', () => {
  it('本地命令目录优先且不改父进程环境', (): void => {
    let 原路径 = process.env['PATH']
    let 环境 = 创建测试子进程环境(项目根目录)
    expect(环境['PATH']?.split(path.delimiter)[0]).toBe(path.join(项目根目录, 'node_modules', '.bin'))
    expect(process.env['PATH']).toBe(原路径)
  })

  it('缺依赖提前说明安装命令，两个命令齐全时通过', async (): Promise<void> => {
    let 根目录 = await 新目录()
    await expect(检查测试命令环境(根目录)).rejects.toThrow(/tsx.*pnpm install/u)
    let 命令目录 = path.join(根目录, 'node_modules/.bin')
    await mkdir(命令目录, { recursive: true })
    let 后缀 = process.platform === 'win32' ? '.cmd' : ''
    await writeFile(path.join(命令目录, `tsx${后缀}`), '')
    await expect(检查测试命令环境(根目录)).rejects.toThrow(/prisma/u)
    await writeFile(path.join(命令目录, `prisma${后缀}`), '')
    await expect(检查测试命令环境(根目录)).resolves.toBeUndefined()
  })
})

type 报告流程 = {
  流程名称: string
  文件: string
  状态: '通过' | '失败' | '中断' | '未执行' | '已排除'
  需求名称们: string[]
  目标验收点名称们: string[]
  目标验收点描述们: string[]
}

function 流程(名称: string, 状态: 报告流程['状态']): 报告流程 {
  return {
    流程名称: 名称,
    文件: `${名称}.ts`,
    状态,
    需求名称们: ['框架示例需求'],
    目标验收点名称们: ['显示结果'],
    目标验收点描述们: ['操作后显示结果'],
  }
}

async function 写报告(目录: string, 选中流程名称们: string[], 流程记录们: 报告流程[]): Promise<string> {
  await mkdir(目录, { recursive: true })
  let 文件 = path.join(目录, 'report.json')
  await writeFile(文件, JSON.stringify({ 开始时间: '2026-11-17T00:00:00.000Z', 选中流程名称们, 流程记录们 }))
  return 文件
}

describe('需求测试补测汇总', () => {
  it('只选择原报告执行范围内的失败与中断流程', async (): Promise<void> => {
    let 文件 = await 写报告(
      await 新目录(),
      ['通过', '失败', '中断', '未执行'],
      [
        流程('通过', '通过'),
        流程('失败', '失败'),
        流程('中断', '中断'),
        流程('未执行', '未执行'),
        流程('范围外', '失败'),
      ],
    )
    expect(await 获得失败流程名称们(文件)).toEqual(['失败', '中断'])
  })

  it('合并采用实际补测，未执行保留旧结果，原报告逐字不变', async (): Promise<void> => {
    let 目录 = await 新目录()
    let 来源文件 = await 写报告(
      path.join(目录, 'original'),
      ['甲', '乙', '丙'],
      [流程('甲', '通过'), 流程('乙', '失败'), 流程('丙', '失败')],
    )
    let 当前文件 = await 写报告(path.join(目录, 'followup'), ['乙', '丙'], [流程('乙', '通过'), 流程('丙', '未执行')])
    let 来源正文 = await readFile(来源文件, 'utf8')
    let 当前正文 = await readFile(当前文件, 'utf8')
    await 保存补测汇总(来源文件, 当前文件)
    let 汇总 = z
      .object({
        总流程数: z.number(),
        已执行数: z.number(),
        通过数: z.number(),
        失败数: z.number(),
        未执行数: z.number(),
        流程记录们: z.array(
          z.object({
            流程名称: z.string(),
            原状态: z.string(),
            补测状态: z.string().optional(),
            状态: z.string(),
            结果来源: z.string(),
          }),
        ),
      })
      .parse(JSON.parse(await readFile(path.join(目录, 'followup/combined.json'), 'utf8')))
    expect(汇总).toMatchObject({ 总流程数: 3, 已执行数: 3, 通过数: 2, 失败数: 1, 未执行数: 0 })
    expect(汇总.流程记录们).toEqual([
      { 流程名称: '甲', 原状态: '通过', 状态: '通过', 结果来源: '../original/index.html' },
      { 流程名称: '乙', 原状态: '失败', 补测状态: '通过', 状态: '通过', 结果来源: 'index.html' },
      { 流程名称: '丙', 原状态: '失败', 补测状态: '未执行', 状态: '失败', 结果来源: '../original/index.html' },
    ])
    expect(await readFile(来源文件, 'utf8')).toBe(来源正文)
    expect(await readFile(当前文件, 'utf8')).toBe(当前正文)
    expect(await readFile(path.join(目录, 'followup/combined.html'), 'utf8')).toContain('原始步骤与附件')
  })

  it.each(['名称', '文件', '验收'])('补测%s与来源不一致则拒绝合并', async (差异): Promise<void> => {
    let 目录 = await 新目录()
    let 来源文件 = await 写报告(path.join(目录, 'original'), ['甲'], [流程('甲', '失败')])
    let 新流程 = 流程('甲', '通过')
    if (差异 === '名称') 新流程.流程名称 = '乙'
    if (差异 === '文件') 新流程.文件 = 'other.ts'
    if (差异 === '验收') 新流程.目标验收点描述们 = ['改变验收规则']
    let 当前文件 = await 写报告(path.join(目录, 'followup'), [新流程.流程名称], [新流程])
    await expect(保存补测汇总(来源文件, 当前文件)).rejects.toThrow(/不一致|已改变/u)
  })

  it('连续补测保留每个结果的原始来源，未执行也不覆盖已有通过', async (): Promise<void> => {
    let 目录 = await 新目录()
    let 来源文件 = await 写报告(
      path.join(目录, 'original'),
      ['甲', '乙', '丙'],
      [流程('甲', '通过'), 流程('乙', '失败'), 流程('丙', '失败')],
    )
    let 第一次 = await 写报告(path.join(目录, 'first'), ['乙'], [流程('乙', '通过')])
    await 保存补测汇总(来源文件, 第一次)
    let 首次汇总文件 = path.join(目录, 'first/combined.json')
    let 首次汇总正文 = await readFile(首次汇总文件, 'utf8')
    let 第二次 = await 写报告(path.join(目录, 'second'), ['乙', '丙'], [流程('乙', '未执行'), 流程('丙', '通过')])
    await 保存补测汇总(首次汇总文件, 第二次)
    let 汇总 = z
      .object({
        通过数: z.number(),
        失败数: z.number(),
        流程记录们: z.array(z.object({ 流程名称: z.string(), 状态: z.string(), 结果来源: z.string() })),
      })
      .parse(JSON.parse(await readFile(path.join(目录, 'second/combined.json'), 'utf8')))
    expect(汇总).toEqual({
      通过数: 3,
      失败数: 0,
      流程记录们: [
        { 流程名称: '甲', 状态: '通过', 结果来源: '../original/index.html' },
        { 流程名称: '乙', 状态: '通过', 结果来源: '../first/index.html' },
        { 流程名称: '丙', 状态: '通过', 结果来源: 'index.html' },
      ],
    })
    expect(await readFile(首次汇总文件, 'utf8')).toBe(首次汇总正文)
  })
})

describe('跨进程无头浏览器资源独占', () => {
  it('占用时指出会话，持有进程终止后自动释放', async (): Promise<void> => {
    let 目录 = await 新目录()
    let 模块地址 = pathToFileURL(path.join(项目根目录, 'src/test-tools/browser-resource-lock.ts')).href
    let 脚本 = path.join(目录, 'owner.mjs')
    let 竞争脚本 = path.join(目录, 'competitor.mjs')
    await writeFile(
      脚本,
      `import { 独占无头浏览器 } from ${JSON.stringify(模块地址)};
await 独占无头浏览器('子进程会话', ${JSON.stringify(目录)});
process.send?.('ready');
process.stdin.resume();`,
    )
    await writeFile(
      竞争脚本,
      `import { 独占无头浏览器 } from ${JSON.stringify(模块地址)};
let 释放 = await 独占无头浏览器('竞争会话', ${JSON.stringify(目录)});
释放(); 释放();
let 再次释放 = await 独占无头浏览器('再次打开', ${JSON.stringify(目录)});
再次释放();`,
    )
    let 子进程 = spawn(process.execPath, ['--import', 'tsx', 脚本], {
      cwd: 项目根目录,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })
    let 已退出 = once(子进程, 'exit')
    try {
      await Promise.race([
        once(子进程, 'message'),
        已退出.then((): never => {
          throw new Error('资源持有子进程启动失败')
        }),
      ])
      await expect(执行文件(process.execPath, ['--import', 'tsx', 竞争脚本], { cwd: 项目根目录 })).rejects.toThrow(
        /子进程会话/u,
      )
    } finally {
      子进程.kill()
      await 已退出
    }
    await expect(执行文件(process.execPath, ['--import', 'tsx', 竞争脚本], { cwd: 项目根目录 })).resolves.toMatchObject(
      { stdout: '' },
    )
  })
})

describe('浏览器回调的序列化检查', () => {
  function 检查(源码: string): Linter.LintMessage[] {
    let 配置: Linter.Config = {
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      plugins: { project: { rules: { 'no-browser-named-callback': 浏览器回调规则 } } },
      rules: { 'project/no-browser-named-callback': 'error' },
    }
    return new Linter().verify(源码, 配置)
  }

  it.each([
    'page.evaluate(() => { let helper = () => 1; return helper() })',
    'locator.evaluateAll(() => { function helper() { return 1 }; return helper() })',
    'page.waitForFunction(() => { let helper = function named() { return true }; return helper() })',
    'page.addInitScript(() => { function helper() {}; helper() })',
  ])('拦住会依赖 Node 侧 __name 的局部函数：%s', (源码): void => {
    expect(检查(源码).some((项) => 项.ruleId === 'project/no-browser-named-callback')).toBe(true)
  })

  it.each([
    'page.evaluate(() => { let helper = { read() { return 1 } }; return helper.read() })',
    'locator.evaluateAll((items) => items.map((item) => item.textContent))',
    'let helper = () => 1; helper()',
  ])('接受对象方法、直接传匿名回调与普通Node函数：%s', (源码): void => {
    expect(检查(源码)).toEqual([])
  })
})

describe('错误分类保留实际证据', () => {
  it.each([
    [{ code: 'ERR_ASSERTION', expected: 1, actual: 2 }, '检查失败'],
    [{ matcherResult: { expected: true, actual: false } }, '检查失败'],
    [new ReferenceError('__name is not defined'), '脚本错误'],
    [{ message: 'strict mode violation: 2 elements' }, '脚本错误'],
    [{ code: 'ENOENT', message: 'missing prisma' }, '环境错误'],
    [{ code: 'SQLITE_BUSY', message: 'database locked' }, '环境错误'],
    [new Error('需要人工定位的失败'), '待诊断'],
  ])('识别错误 %j', (错误, 预期): void => {
    expect(格式化需求测试错误(错误, import.meta.filename).类别).toBe(预期)
  })
})

describe('补测选项连接实际运行器', () => {
  it('list仅列出来源失败流程，补测与手动选范围互斥', async (): Promise<void> => {
    let 根目录 = await 新目录()
    let 目录 = path.join(根目录, 'test/requirement/example')
    await mkdir(目录, { recursive: true })
    let 模型路径 = path.join(项目根目录, 'src/model/test-requirement/index.ts').replaceAll('\\', '/')
    await writeFile(
      path.join(目录, 'index.requirement.ts'),
      `import { 需求, 验收点 } from ${JSON.stringify(模型路径)};
export let 验收点们 = { 显示: new 验收点({ 名称: '显示结果', 描述: '操作后显示结果' }) };
export let 业务需求 = new 需求({ 名称: '框架示例需求', 描述: '只供列表发现', 验收点们: Object.values(验收点们) });`,
    )
    await writeFile(
      path.join(目录, 'flows.ts'),
      `import { 流程, 观察, 需求测试 } from ${JSON.stringify(模型路径)};
import { 业务需求, 验收点们 } from './index.requirement';
export default class 示例 extends 需求测试 {
  public constructor() { super([业务需求], ['通过流程', '失败流程'].map((名称) => new 流程({
    名称, 初始化: () => ({}), 覆盖验收点们: [验收点们.显示], 步骤们: [new 观察('检查', () => {})],
  })), { 使用测试服务: false }); }
}`,
    )
    let 来源文件 = await 写报告(
      path.join(根目录, 'original'),
      ['通过流程', '失败流程'],
      [
        { ...流程('通过流程', '通过'), 文件: 'test/requirement/example/flows.ts' },
        { ...流程('失败流程', '失败'), 文件: 'test/requirement/example/flows.ts' },
      ],
    )
    let 输出 = vi.spyOn(console, 'log').mockImplementation((): void => {})
    try {
      let 运行器 = new 需求测试运行器(根目录)
      expect(await 运行器.运行(['--retry-failed', 来源文件, '--list'])).toBe(0)
      expect(输出.mock.calls).toEqual([['失败流程 · example/flows.ts']])
      await expect(运行器.运行(['--retry-failed', 来源文件, '--all', '--list'])).rejects.toThrow(/只能选择一种/u)
      await expect(运行器.运行(['--retry-failed', 来源文件, '--scenario', '通过流程', '--list'])).rejects.toThrow(
        /只能选择一种/u,
      )
    } finally {
      输出.mockRestore()
    }
  })
})

describe('长流程导出保持完整步骤与资源位置', () => {
  it('拆到辅助目录后保留顺序、图片URL、断言且整体通过tsc', async (): Promise<void> => {
    let 输出目录 = path.join(项目根目录, 'test-outputs')
    await mkdir(输出目录, { recursive: true })
    let 根目录 = await mkdtemp(path.join(输出目录, 'framework-split-'))
    临时目录们.push(根目录)
    let 入口目录 = path.join(根目录, 'test/requirement/example')
    let 辅助目录 = path.join(根目录, 'test/requirement-support/example/long-flow')
    await mkdir(入口目录, { recursive: true })
    await mkdir(辅助目录, { recursive: true })
    let 入口文件 = path.join(入口目录, 'long-flow.ts')
    let 调用 = (id: number, tool: string, 参数: 操作调用条目['arguments']): 操作调用条目 => ({
      id,
      kind: 'call',
      tool,
      arguments: 参数,
      start: '2026-11-17T00:00:00Z',
      end: '2026-11-17T00:00:01Z',
      status: 'passed',
      result: { state: 'visible' },
      artifacts: [],
      evidenceErrors: [],
      notes: null,
    })
    let 步骤组: 导出回放步骤[] = Array.from({ length: 150 }, (_, 索引) => ({
      名称: `观察-${String(索引)}`,
      备注们: [],
      条目们: [调用(索引 + 1, 'browser_screenshot', { name: 'a' })],
    }))
    步骤组.push({
      名称: '点击图片',
      备注们: [],
      条目们: [
        {
          ...调用(151, 'browser_click_at', { name: 'a', x: 10, y: 20 }),
          增强: { 模板: { 文件: '/unused.png', 比例: 1, 原坐标: { x: 10, y: 20 }, 落点: { x: 2, y: 2 } } },
        },
      ],
    })
    步骤组.push({
      名称: '最终验收',
      备注们: [],
      条目们: [
        调用(152, 'browser_wait', {
          name: 'a',
          target: { by: 'text', text: '完成' },
          state: 'visible',
          timeoutMs: 1000,
        }),
        {
          id: 153,
          kind: 'assertion',
          sourceId: 152,
          path: ['state'],
          expected: 'visible',
          notes: null,
          operator: 'deepEqual',
          createdAt: '2026-11-17T00:00:00Z',
        },
      ],
    })
    let 相对源码 = path.relative(入口目录, path.join(项目根目录, 'src')).replaceAll('\\', '/')
    await writeFile(
      path.join(入口目录, 'index.requirement.ts'),
      `import { 需求, 验收点 } from '${相对源码}/model/test-requirement';
export let 验收点们 = { 完成: new 验收点({ 名称: '完成', 描述: '显示完成' }) };
export let 业务需求 = new 需求({ 名称: '示例', 描述: '示例', 验收点们: Object.values(验收点们) });`,
    )
    let 内容 = await format(
      生成需求测试代码({
        流程名称: '长流程',
        需求模块路径: './index.requirement',
        源码目录路径: 相对源码,
        覆盖验收点键们: ['完成'],
        步骤组,
        测试地址: { 前端: 'http://localhost', 后端: 'http://localhost' },
        文件名: 'long-flow.ts',
      }),
      { parser: 'typescript' },
    )
    expect(内容.split('\n').length).toBeGreaterThan(500)
    let 拆分 = 拆分需求测试源码(内容, 入口文件, 辅助目录)
    expect(拆分.辅助们.length).toBeGreaterThan(1)
    await writeFile(入口文件, 拆分.入口)
    for (let 辅助 of 拆分.辅助们) {
      expect(辅助.路径.startsWith(辅助目录)).toBe(true)
      expect((await format(辅助.内容, { parser: 'typescript' })).split('\n').length).toBeLessThanOrEqual(500)
      await writeFile(辅助.路径, 辅助.内容)
    }
    let 全部辅助 = 拆分.辅助们.map(({ 内容: 源码 }) => 源码).join('\n')
    let 名称们 = [...全部辅助.matchAll(/观察-(\d+)/gu)].map((匹配) => Number(匹配[1]))
    expect(名称们).toEqual(Array.from({ length: 150 }, (_, 索引) => 索引))
    expect(全部辅助).toContain('deepStrictEqual(实际, 预期)')
    expect(全部辅助).toContain('验证可见')
    let 模板相对路径 = path.relative(辅助目录, path.join(入口目录, 'assets/long-flow-151.png')).replaceAll('\\', '/')
    expect(全部辅助).toContain(JSON.stringify(模板相对路径))
    let 配置文件 = path.join(根目录, 'tsconfig.json')
    await writeFile(
      配置文件,
      JSON.stringify({
        extends: path.join(项目根目录, 'tsconfig.json'),
        include: [path.join(根目录, 'test/**/*.ts')],
        exclude: [],
        compilerOptions: { noEmit: true },
      }),
    )
    let 编译 = await 执行文件(
      process.execPath,
      [path.join(项目根目录, 'node_modules/typescript/bin/tsc'), '-p', 配置文件],
      { cwd: 项目根目录 },
    )
    expect(编译.stdout).toBe('')
  }, 60_000)
})
