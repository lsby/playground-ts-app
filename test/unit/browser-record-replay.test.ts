import { chromium, type Browser, type Page } from '@playwright/test'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { runInThisContext } from 'node:vm'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { 启动测试MCP } from '../../scripts/test/mcp/http'
import type { MCP测试工具宿主 } from '../../scripts/test/mcp/tools'
import { 生成调用代码 } from '../../scripts/test/requirement/operation-code'
import { 浏览器测试引擎 } from '../../src/model/browser-test'
import { JSON对象模式 } from '../../src/model/data/json-value'
import type { 需求测试工具 } from '../../src/model/test-requirement'
import { 测试操作记录, type JSON对象, type 操作调用条目 } from '../../src/test-tools/operation-record'

vi.mock('../../src/global/env', () => ({
  获得环境变量: (): never => {
    throw new Error('本测试不使用后端环境')
  },
}))

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 浏览器: Browser | null = null
let 页面: Page
let 引擎: 浏览器测试引擎
let MCP: Awaited<ReturnType<typeof 启动测试MCP>> | null = null
let 记录: 测试操作记录
let 目录 = ''
let 耗时: Record<string, number> = {}
let 执行文件 = promisify(execFile)
let 内容模型 = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
])
type MCP调用响应 = {
  recordId: number
  result?: JSON对象 | undefined
  error?: string | undefined
  replay?: { supported: boolean; reason?: string | undefined } | undefined
  content: z.infer<typeof 内容模型>[]
}

async function 调用(名称: string, 参数: JSON对象): Promise<MCP调用响应> {
  if (MCP === null) throw new Error('测试 MCP 尚未启动')
  let 响应 = await fetch(MCP.地址, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 名称, arguments: 参数 } }),
  })
  let 正文 = await 响应.text()
  let 数据: string
  if (响应.headers.get('content-type')?.startsWith('text/event-stream') === true) {
    let 事件 = 正文.split('\n').find((行): boolean => 行.startsWith('data: '))
    if (事件 === undefined) throw new Error('MCP 响应缺少事件数据')
    数据 = 事件.slice('data: '.length)
  } else 数据 = 正文
  let 包装 = z
    .object({
      result: z.object({
        content: z.array(内容模型),
        structuredContent: z.object({
          recordId: z.number(),
          result: JSON对象模式.optional(),
          error: z.string().optional(),
          replay: z.object({ supported: z.boolean(), reason: z.string().optional() }).optional(),
        }),
      }),
    })
    .parse(JSON.parse(数据))
  return { ...包装.result.structuredContent, content: 包装.result.content }
}

async function 准备延迟页面(): Promise<void> {
  await 页面.setContent(`<button id="start" onclick="setTimeout(()=>document.getElementById('ready').hidden=false,250)">开始</button>
    <section id="ready" hidden><button id="close" onclick="setTimeout(()=>document.getElementById('ready').hidden=true,250)">关闭</button></section>`)
}

async function 回放(编号: number): Promise<void> {
  let 条目 = await 记录.获得(编号)
  if (条目.kind !== 'call') throw new Error('需要调用记录')
  let 代码 = 生成调用代码(条目, { 需要结果: false, 测试地址: { 前端: 'http://localhost', 后端: 'http://localhost' } })
  expect(代码.语句们.join('\n')).not.toMatch(/观察|waitForTimeout|networkidle/u)
  let 执行: unknown = runInThisContext(`(async (当前状态) => { ${代码.语句们.join('\n')} })`)
  if (typeof 执行 !== 'function') throw new Error('生成代码未产生回放函数')
  z.void().parse(await 执行({ 工具: { 浏览器: { 获得: (): 浏览器测试引擎 => 引擎 } } }))
}

beforeAll(async () => {
  await mkdir(path.join(项目根目录, 'test-outputs'), { recursive: true })
  目录 = await mkdtemp(path.join(项目根目录, 'test-outputs/browser-record-replay-'))
  记录 = new 测试操作记录(目录)
  await 记录.初始化()
  浏览器 = await chromium.launch({ headless: true })
  页面 = await 浏览器.newPage()
  引擎 = new 浏览器测试引擎({ 页面, 模式: '自动' })
  let 不使用 = (): never => {
    throw new Error('本用例不使用此工具')
  }
  let 工具: 需求测试工具 = {
    取消信号: new AbortController().signal,
    服务地址: (): string => 'http://localhost',
    浏览器: {
      打开: async (): Promise<浏览器测试引擎> => 引擎,
      获得: (): 浏览器测试引擎 => 引擎,
      列出: (): string[] => ['条件'],
      关闭: async (): Promise<void> => {},
    },
    Android: { 打开: 不使用, 获得: 不使用 },
    iOS: { 打开: 不使用, 获得: 不使用, 确保会话可用: 不使用 },
    数据库: { 查询: 不使用, 执行: 不使用, 表结构: 不使用 },
    HTTP: { 请求: 不使用 },
    后端日志: { 读取: (): { 标准输出: string; 错误输出: string } => ({ 标准输出: '', 错误输出: '' }) },
  }
  let 宿主: MCP测试工具宿主 = {
    操作记录: 记录,
    执行工具: async (执行) => await 执行(),
    重置数据库: 不使用,
    执行: async (执行) => ({ 结果: { 成功: true, 值: await 执行(工具, (): void => {}) }, 附件们: [], 取证错误们: [] }),
    获得测试地址: (): { 前端: string; 后端: string } => ({ 前端: 'http://localhost', 后端: 'http://localhost' }),
    获得设备: (): { 安卓: undefined; 苹果: undefined } => ({ 安卓: undefined, 苹果: undefined }),
    读取后端日志: (): { 标准输出: string; 错误输出: string } => ({ 标准输出: '', 错误输出: '' }),
    获得输出目录: (): string => 目录,
  }
  MCP = await 启动测试MCP(宿主, 0)
})

afterAll(async () => {
  if (MCP !== null) await MCP.关闭()
  if (浏览器 !== null) await 浏览器.close()
  if (目录 !== '') await writeFile(path.join(目录, 'timing.json'), JSON.stringify(耗时, null, 2))
})

describe('浏览器录制与回放的条件一致', () => {
  it('重复文字在录制时说明歧义，限定区域后的定位可以导出回放', async (): Promise<void> => {
    let 内容 = `<span>未登录</span><section role="region" aria-label="后台状态"><button onclick="this.textContent='已登录'">未登录</button></section>`
    await 页面.setContent(内容)
    let 歧义 = await 调用('browser_click', {
      name: '条件',
      target: { by: 'text', text: '未登录', exact: true },
      observe: false,
    })
    expect(歧义.error).toMatch(/匹配了 2 个元素/u)
    expect(歧义.error).toContain('<span>未登录</span>')
    expect(歧义.error).toContain('within')
    let 点击 = await 调用('browser_click', {
      name: '条件',
      target: { by: 'text', text: '未登录', exact: true, within: { by: 'role', role: 'region', name: '后台状态' } },
      observe: false,
    })
    expect(点击.error).toBeUndefined()
    expect(点击.replay?.supported).toBe(true)
    expect(await 页面.getByRole('button').textContent()).toBe('已登录')
    await 页面.setContent(内容)
    await 回放(点击.recordId)
    expect(await 页面.getByRole('button').textContent()).toBe('已登录')
  })

  it('零匹配可以等待隐藏，后来出现的目标仍由显式条件等待', async (): Promise<void> => {
    await 页面.setContent(
      "<button onclick=\"setTimeout(()=>this.insertAdjacentHTML('afterend','<p id=ready>完成</p>'),100)\">开始</button>",
    )
    let 隐藏 = await 调用('browser_wait', {
      name: '条件',
      target: { by: 'selector', selector: '#ready' },
      state: 'hidden',
      timeoutMs: 1000,
    })
    expect(隐藏.error).toBeUndefined()
    await 调用('browser_click', { name: '条件', target: { by: 'role', role: 'button', name: '开始' }, observe: false })
    let 出现 = await 调用('browser_wait', {
      name: '条件',
      target: { by: 'selector', selector: '#ready' },
      state: 'visible',
      timeoutMs: 1000,
    })
    expect(出现.error).toBeUndefined()
  })

  it('实际tsx编译后的对象方法回调可在浏览器运行，命名局部函数会暴露__name错误', async (): Promise<void> => {
    let 脚本 = path.join(目录, 'callback-serialization.ts')
    await writeFile(
      脚本,
      `let 错误回调 = (): number => { let 双倍 = (值: number): number => 值 * 2; return 双倍(21) };
let 正确回调 = (): number => { let 运算 = { 双倍(值: number): number { return 值 * 2 } }; return 运算.双倍(21) };
console.log(JSON.stringify({ 错误: 错误回调.toString(), 正确: 正确回调.toString() }));`,
    )
    let 输出 = await 执行文件(process.execPath, ['--import', 'tsx', 脚本], { cwd: 项目根目录 })
    let 回调 = z.object({ 错误: z.string(), 正确: z.string() }).parse(JSON.parse(输出.stdout))
    expect(回调.错误).toContain('__name')
    await expect(页面.evaluate(`(${回调.错误})()`)).rejects.toThrow(/__name/u)
    expect(await 页面.evaluate(`(${回调.正确})()`)).toBe(42)
  })

  it('主动截图返回原分辨率 PNG 并加刻度白边', async (): Promise<void> => {
    await 调用('browser_environment', {
      name: '条件',
      width: 2400,
      height: 1200,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      observe: false,
    })
    let 结果 = await 调用('browser_screenshot', { name: '条件' })
    let 图片们 = 结果.content.filter((内容) => 内容.type === 'image')
    expect(图片们).toHaveLength(1)
    let 图片 = 图片们[0]
    if (图片 === undefined) throw new Error('截图未返回图片')
    expect(图片.mimeType).toBe('image/png')
    let 元数据 = await sharp(Buffer.from(图片.data, 'base64')).metadata()
    expect(元数据.format).toBe('png')
    // 原分辨率截图四周加刻度白边，白边四边等宽
    expect(元数据.width - 2400).toBe(元数据.height - 1200)
    expect(元数据.width).toBeGreaterThan(2400)
    expect(结果.replay?.supported).toBe(true)
    await 回放(结果.recordId)
  })

  it('延迟出现与退出均由显式条件等待，导出回放不依赖 OCR 暂停', async () => {
    let 截图 = vi.spyOn(引擎, '截图')
    await 准备延迟页面()
    let 开始 = performance.now()
    let 点击 = await 调用('browser_click', {
      name: '条件',
      target: { by: 'selector', selector: '#start' },
      observe: false,
    })
    let 出现 = await 调用('browser_wait', {
      name: '条件',
      target: { by: 'selector', selector: '#ready' },
      state: 'visible',
      timeoutMs: 1000,
    })
    let 关闭 = await 调用('browser_click', {
      name: '条件',
      target: { by: 'selector', selector: '#close' },
      observe: false,
    })
    let 消失 = await 调用('browser_wait', {
      name: '条件',
      target: { by: 'selector', selector: '#ready' },
      state: 'hidden',
      timeoutMs: 1000,
    })
    耗时['录制毫秒'] = performance.now() - 开始
    expect([点击, 出现, 关闭, 消失].every((项) => 项.error === undefined)).toBe(true)
    expect(截图).not.toHaveBeenCalled()
    await 准备延迟页面()
    开始 = performance.now()
    for (let 项 of [点击, 出现, 关闭, 消失]) await 回放(项.recordId)
    耗时['回放毫秒'] = performance.now() - 开始
    expect(await 页面.locator('#ready').isVisible()).toBe(false)
    expect(截图).not.toHaveBeenCalled()
    截图.mockRestore()
  })

  it('默认观察真实浏览器时多帧采样，业务结果不混入观察信息', async () => {
    let 截图 = vi.spyOn(引擎, '截图')
    let 开始 = performance.now()
    let 结果 = await 调用('browser_environment', {
      name: '条件',
      width: 390,
      height: 844,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    })
    耗时['默认多帧观察毫秒'] = performance.now() - 开始
    expect(结果.error).toBeUndefined()
    expect(结果.result?.['settled']).toBe(true)
    expect(结果.result?.['frames']).toBeInstanceOf(Array)
    expect(结果.content.map((项) => 项.type)).toEqual(['text', 'text', 'image'])
    let 说明 = 结果.content[1]
    let 图片 = 结果.content[2]
    if (说明?.type !== 'text' || 图片?.type !== 'image') throw new Error('观察应交替返回说明和图片')
    expect(说明.text).toContain('最终采样画面')
    expect(说明.text).toContain('四周刻度数字就是点击坐标')
    expect(图片.mimeType).toBe('image/webp')
    let 尺寸 = await sharp(Buffer.from(图片.data, 'base64')).metadata()
    expect(尺寸.format).toBe('webp')
    expect(尺寸.width).toBeGreaterThan(390)
    expect(尺寸.height).toBeGreaterThan(844)
    expect(尺寸.width - 390).toBe(尺寸.height - 844)
    expect(截图.mock.calls.length).toBeGreaterThanOrEqual(4)
    let 原记录 = await 记录.获得(结果.recordId)
    if (原记录.kind !== 'call' || 原记录.status !== 'passed') throw new Error('环境操作应录制成功')
    expect(原记录.result).not.toHaveProperty('observation')
    expect(原记录.result).not.toHaveProperty('frames')
    expect(原记录.result).not.toHaveProperty('settled')
    截图.mockRestore()
  })

  it('显式开启采样时，采样等待不会进入导出代码', async () => {
    let 截图 = vi.spyOn(引擎, '截图')
    let 开始 = performance.now()
    let 结果 = await 调用('browser_environment', {
      name: '条件',
      width: 390,
      height: 844,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      observe: true,
    })
    耗时['稳定诊断毫秒'] = performance.now() - 开始
    expect(结果.error).toBeUndefined()
    expect(结果.result?.['settled']).toBe(true)
    expect(截图.mock.calls.length).toBeGreaterThanOrEqual(4)
    let 条目 = await 记录.获得(结果.recordId)
    if (条目.kind !== 'call') throw new Error('需要调用记录')
    let 代码 = 生成调用代码(条目, { 需要结果: false, 测试地址: { 前端: 'http://localhost', 后端: 'http://localhost' } })
    expect(代码.语句们.join('\n')).not.toMatch(/stable|observation|等待|waitForTimeout/u)
    截图.mockRestore()
  })

  it('录制与导出回放遇到无法满足的条件均超时报错', async () => {
    await 页面.setContent('<div id="ready">仍然显示</div>')
    let 等待 = await 调用('browser_wait', {
      name: '条件',
      target: { by: 'selector', selector: '#ready' },
      state: 'hidden',
      timeoutMs: 100,
    })
    expect(等待.error).toMatch(/100|hidden/u)
    await expect(回放(等待.recordId)).rejects.toThrow()
  })

  it('观察开关及旧记录都能导出，观察选项不会进入业务环境或回放', () => {
    let 条目: 操作调用条目 = {
      id: 1,
      kind: 'call',
      tool: 'browser_environment',
      arguments: { name: '条件', width: 390, height: 844, colorScheme: 'dark', reducedMotion: 'reduce' },
      start: '2026-11-13T00:00:00Z',
      end: '2026-11-13T00:00:01Z',
      notes: null,
      status: 'passed',
      result: {},
      artifacts: [],
      evidenceErrors: [],
    }
    let 旧代码 = 生成调用代码(条目, {
      需要结果: false,
      测试地址: { 前端: 'http://localhost', 后端: 'http://localhost' },
    })
    let 新代码 = 生成调用代码(
      { ...条目, arguments: { ...条目.arguments, observation: 'stable' } },
      { 需要结果: false, 测试地址: { 前端: 'http://localhost', 后端: 'http://localhost' } },
    )
    expect(新代码).toEqual(旧代码)
    expect(新代码.语句们.join('\n')).not.toContain('observation')
    let 历史: 操作调用条目 = { ...条目, tool: 'browser_history', arguments: { name: '条件', direction: 'back' } }
    let 历史旧代码 = 生成调用代码(历史, {
      需要结果: false,
      测试地址: { 前端: 'http://localhost', 后端: 'http://localhost' },
    })
    let 历史新代码 = 生成调用代码(
      { ...历史, arguments: { ...历史.arguments, observe: false } },
      { 需要结果: false, 测试地址: { 前端: 'http://localhost', 后端: 'http://localhost' } },
    )
    expect(历史新代码).toEqual(历史旧代码)
    expect(历史新代码.语句们.join('\n')).toContain('移动浏览器历史("back")')
  })
})
