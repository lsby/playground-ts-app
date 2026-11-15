import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { 复制模板资源 } from '../../scripts/test/requirement/export-file'
import { 列出模板资源, 生成需求测试代码 } from '../../scripts/test/requirement/export-operation-record'
import { 生成调用代码 } from '../../scripts/test/requirement/operation-code'
import type { JSON对象, 录制增强, 操作调用条目 } from '../../src/test-tools/operation-record'

vi.mock('../../src/global/env/env', () => ({
  获得环境变量: (): never => {
    throw new Error('本测试不使用后端环境')
  },
}))

let 执行文件 = promisify(execFile)
let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 测试地址 = { 前端: 'http://localhost:3000', 后端: 'http://localhost:3001' }
let 临时目录们: string[] = []

function 条目(id: number, tool: string, 参数: JSON对象, 结果: JSON对象, 增强?: 录制增强): 操作调用条目 {
  return {
    id,
    kind: 'call',
    tool,
    arguments: 参数,
    start: '2026-11-14T00:00:00.000Z',
    end: '2026-11-14T00:00:01.000Z',
    status: 'passed',
    result: 结果,
    artifacts: [],
    evidenceErrors: [],
    notes: null,
    ...(增强 === undefined ? {} : { 增强 }),
  }
}

function 代码(条目们: 操作调用条目, 需要结果 = false, 流程文件名前缀 = 'gift-flow'): string {
  return 生成调用代码(条目们, { 需要结果, 测试地址, 流程文件名前缀 }).语句们.join('\n')
}

let 定位: 录制增强 = { 定位: { 种类: '选择器', 值: 'button[aria-label="收下礼物"]', 说明: '按钮「收下礼物」' } }
let 文字定位: 录制增强 = { 定位: { 种类: '文字', 值: '收下礼物', 说明: '按钮「收下礼物」' } }
let 模板增强: 录制增强 = {
  模板: { 文件: '/tmp/op-4.png', 比例: 3, 原坐标: { x: 200, y: 300 }, 落点: { x: 32, y: 32 } },
}
let 地址增强: 录制增强 = { 地址变化: { 前: '/#/home', 后: '/#/gift' } }

describe('坐标点击导出成按元素点击', () => {
  it('浏览器：选择器用 引擎.定位，文字用 引擎.按文本，都带超时', () => {
    expect(代码(条目(1, 'browser_click_at', { name: 'a', x: 50, y: 30 }, { clicked: true }, 定位))).toContain(
      'await 引擎.点击(引擎.定位("button[aria-label=\\"收下礼物\\"]"), { timeout: 15000 })',
    )
    expect(代码(条目(1, 'browser_click_at', { name: 'a', x: 50, y: 30 }, { clicked: true }, 文字定位))).toContain(
      'await 引擎.点击(引擎.按文本("收下礼物", { exact: true }), { timeout: 15000 })',
    )
  })

  it('没有任何识别信息时浏览器仍点原坐标（旧录制兼容）', () => {
    expect(代码(条目(1, 'browser_click_at', { name: 'a', x: 5, y: 6 }, { clicked: true }))).toContain(
      'await 引擎.点击坐标(5, 6)',
    )
  })
})

describe('地址变化导出成等地址', () => {
  it('浏览器按路由地址等待，由引擎按规范地址比较，忽略 origin', () => {
    let 结果 = 代码(
      条目(
        1,
        'browser_click',
        { name: 'a', target: { by: 'text', text: '去礼物页' }, timeoutMs: 5000 },
        { clicked: true },
        地址增强,
      ),
    )
    expect(结果).toContain('await 引擎.等待地址("/#/gift", { timeout: 15000, waitUntil: \'domcontentloaded\' })')
  })

  it('旧录制里带随机 flow 编号的地址，导出时去掉', () => {
    let 带编号: 录制增强 = {
      地址变化: { 前: '/#home', 后: '/#protocol?flow=7c9e6679-7425-40de-944b-e07fc1f90ae7&step=2' },
    }
    let 浏览器 = 代码(
      条目(
        1,
        'browser_click',
        { name: 'a', target: { by: 'text', text: 'x' }, timeoutMs: 5000 },
        { clicked: true },
        带编号,
      ),
    )
    expect(浏览器).toContain('等待地址("/#protocol", {')
    expect(浏览器).not.toContain('flow=')
  })

  it('没有地址变化时不生成等地址', () => {
    expect(
      代码(
        条目(
          1,
          'browser_click',
          { name: 'a', target: { by: 'text', text: 'x' }, timeoutMs: 5000, observe: true },
          { clicked: true },
        ),
      ),
    ).not.toContain('等待地址')
  })
})

describe('没有 DOM 的点击导出成等图片后点击', () => {
  it('带模板时生成等待图片后点击，路径相对流程文件，并登记要复制的资源', () => {
    let 结果 = 生成调用代码(
      条目(4, 'browser_click_at', { name: 'a', x: 200, y: 300, observe: true }, { clicked: true }, 模板增强),
      { 需要结果: false, 测试地址, 流程文件名前缀: 'gift-flow' },
    )
    let 语句 = 结果.语句们.join('\n')
    expect(语句).toContain(
      'await 引擎.等待图片后点击(new URL("assets/gift-flow-4.png", import.meta.url), {"x":200,"y":300,"比例":3,"落点":{"x":32,"y":32}}, 15000)',
    )
    expect(语句).not.toContain('点击坐标')
    expect(结果.模板资源).toEqual({ 操作编号: 4, 来源路径: '/tmp/op-4.png', 相对路径: 'assets/gift-flow-4.png' })
  })

  it('有定位时优先按元素点击，不再使用模板', () => {
    let 结果 = 生成调用代码(
      条目(4, 'browser_click_at', { name: 'a', x: 1, y: 2 }, { clicked: true }, { ...定位, ...模板增强 }),
      { 需要结果: false, 测试地址 },
    )
    expect(结果.语句们.join('\n')).not.toContain('等待图片后点击')
    expect(结果.模板资源).toBeUndefined()
  })

  it('浏览器支持图片模板', () => {
    expect(代码(条目(4, 'browser_click_at', { name: 'a', x: 200, y: 300 }, { clicked: true }, 模板增强))).toContain(
      '等待图片后点击',
    )
  })
})

describe('完整导出并通过类型检查', () => {
  afterAll(async () => {
    for (let 目录 of 临时目录们) await rm(目录, { recursive: true, force: true })
  })

  it('生成需求测试代码包含按元素点击、等地址和图片模板，复制模板到 assets，tsc 通过', async () => {
    await mkdir(path.join(项目根目录, 'test-outputs'), { recursive: true })
    let 目录 = await mkdtemp(path.join(项目根目录, 'test-outputs/replay-robust-export-'))
    临时目录们.push(目录)
    let 模板源 = path.join(目录, 'op-3.png')
    await writeFile(模板源, Buffer.from('fake-png'))
    let 浏览器条目 = [
      条目(
        1,
        'browser_open',
        { name: 'a', url: '/', timeoutMs: 5000, observe: true },
        { name: 'a', url: 'http://localhost:3000/' },
      ),
      条目(2, 'browser_click_at', { name: 'a', x: 50, y: 30 }, { clicked: true }, { ...定位, ...地址增强 }),
      条目(
        3,
        'browser_click_at',
        { name: 'a', x: 200, y: 300 },
        { clicked: true },
        { 模板: { 文件: 模板源, 比例: 1, 原坐标: { x: 200, y: 300 }, 落点: { x: 32, y: 32 } } },
      ),
      条目(
        4,
        'browser_wait',
        { name: 'a', target: { by: 'text', text: '收下成功' }, state: 'visible', timeoutMs: 5000 },
        { state: 'visible' },
      ),
    ]
    let 步骤组 = [
      { 名称: '进入页面', 条目们: [浏览器条目[0] as 操作调用条目], 备注们: [] },
      { 名称: '点击', 条目们: [浏览器条目[1] as 操作调用条目, 浏览器条目[2] as 操作调用条目], 备注们: [] },
      { 名称: '验收', 条目们: [浏览器条目[3] as 操作调用条目], 备注们: [] },
    ]
    await writeFile(
      path.join(目录, 'index.requirement.ts'),
      `import { 需求, 验收点 } from '${path.relative(目录, path.join(项目根目录, 'src/model/test-requirement')).replaceAll('\\', '/')}'

export let 验收点们 = { 收下: new 验收点({ 名称: '收下', 描述: '点击收下后显示成功。' }) }
export let 业务需求 = new 需求({ 名称: '收下礼物', 描述: '可以收下礼物。', 验收点们: Object.values(验收点们) })
`,
    )
    let 源码 = 生成需求测试代码({
      流程名称: '收礼物',
      需求模块路径: './index.requirement',
      源码目录路径: path.relative(目录, path.join(项目根目录, 'src')).replaceAll('\\', '/'),
      覆盖验收点键们: ['收下'],
      步骤组,
      测试地址,
      文件名: 'gift-flow.ts',
    })
    expect(源码).toContain('引擎.定位("button[aria-label=\\"收下礼物\\"]")')
    expect(源码).toContain('await 引擎.等待地址("/#/gift", { timeout: 15000, waitUntil: \'domcontentloaded\' })')
    expect(源码).toContain('new URL("assets/gift-flow-3.png", import.meta.url)')
    expect(源码).not.toContain('等待画面稳定')
    expect(源码).not.toContain('点击坐标')
    await writeFile(path.join(目录, 'gift-flow.ts'), 源码)

    let 模板们 = 列出模板资源(步骤组, 'gift-flow.ts')
    expect(模板们).toEqual([{ 操作编号: 3, 来源路径: 模板源, 相对路径: 'assets/gift-flow-3.png' }])
    let 已复制 = await 复制模板资源(目录, 模板们)
    expect(已复制).toEqual([path.join(目录, 'assets/gift-flow-3.png')])
    expect((await readFile(path.join(目录, 'assets/gift-flow-3.png'))).toString()).toBe('fake-png')
    // 重复复制同样内容沿用，不同内容报错且不覆盖
    expect(await 复制模板资源(目录, 模板们)).toEqual([])
    await writeFile(模板源, Buffer.from('changed'))
    await expect(复制模板资源(目录, 模板们)).rejects.toThrow(/不同内容/u)
    expect((await readFile(path.join(目录, 'assets/gift-flow-3.png'))).toString()).toBe('fake-png')

    await writeFile(
      path.join(目录, 'tsconfig.json'),
      JSON.stringify({
        extends: path.join(项目根目录, 'tsconfig.json'),
        include: [path.join(目录, '*.ts')],
        exclude: [],
        compilerOptions: { noEmit: true },
      }),
    )
    let 结果 = await 执行文件(
      process.execPath,
      [path.join(项目根目录, 'node_modules/typescript/bin/tsc'), '-p', path.join(目录, 'tsconfig.json')],
      { cwd: 项目根目录 },
    )
    expect(结果.stdout).toBe('')
  }, 180_000)
})
