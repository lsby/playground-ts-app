import { chromium, type Browser, type Page } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
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
import { 测试操作记录, type JSON对象 } from '../../src/test-tools/operation-record'

vi.mock('../../src/global/env', () => ({
  获得环境变量: (): never => {
    throw new Error('本测试不使用后端环境')
  },
}))

// 需要真实浏览器：先试 Playwright 自带的 chromium，没有再试本机安装的 Chrome，都没有就整体跳过（不下载浏览器）。
async function 启动浏览器(): Promise<Browser | undefined> {
  for (let 选项 of [{}, { channel: 'chrome' }]) {
    try {
      return await chromium.launch({ headless: true, ...选项 })
    } catch {
      // 换下一种
    }
  }
  return undefined
}

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 浏览器: Browser | undefined
let 页面: Page
let 引擎: 浏览器测试引擎
let MCP: Awaited<ReturnType<typeof 启动测试MCP>> | null = null
let 记录: 测试操作记录
let 目录 = ''
let 内容模型 = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
])
let 测试地址 = { 前端: 'http://127.0.0.1', 后端: 'http://127.0.0.1' }

async function 调用(
  名称: string,
  参数: JSON对象,
): Promise<{ recordId: number; result?: JSON对象 | undefined; error?: string | undefined }> {
  if (MCP === null) throw new Error('测试 MCP 尚未启动')
  let 响应 = await fetch(MCP.地址, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 名称, arguments: 参数 } }),
  })
  let 正文 = await 响应.text()
  let 数据 =
    响应.headers.get('content-type')?.startsWith('text/event-stream') === true
      ? (正文.split('\n').find((行) => 行.startsWith('data: ')) ?? '').slice(6)
      : 正文
  let 包装 = z
    .object({
      result: z.object({
        content: z.array(内容模型),
        structuredContent: z.object({
          recordId: z.number(),
          result: JSON对象模式.optional(),
          error: z.string().optional(),
        }),
      }),
    })
    .parse(JSON.parse(数据))
  return 包装.result.structuredContent
}

let 应用HTML = `<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin: 0; background: #fff; font: 16px sans-serif }
  button { position: absolute; left: 20px; top: 20px; width: 160px; height: 50px }
  #out { position: absolute; left: 20px; top: 90px }
  canvas { position: absolute; left: 20px; top: 200px; width: 200px; height: 120px; border: 1px solid #333 }
</style>
<button aria-label="去礼物页" onclick="location.hash='#/gift'">去礼物页</button>
<div id="out">未点</div>
<canvas id="stage" width="200" height="120"></canvas>
<script>
  let c = document.getElementById('stage'), g = c.getContext('2d')
  g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 120)
  g.fillStyle = '#d33'; g.beginPath(); g.arc(100, 60, 30, 0, 7); g.fill()
  g.fillStyle = '#222'; g.font = 'bold 24px sans-serif'; g.fillText('GO', 82, 68)
  g.fillStyle = '#36c'; g.fillRect(10, 10, 30, 30)
  c.addEventListener('click', (e) => { document.getElementById('out').textContent = '画布已点' })
</script>`

async function 打开应用(): Promise<void> {
  await 页面.goto('http://127.0.0.1/app')
}

beforeAll(async () => {
  浏览器 = await 启动浏览器()
  if (浏览器 === undefined) return
  await mkdir(path.join(项目根目录, 'test-outputs'), { recursive: true })
  目录 = await mkdtemp(path.join(项目根目录, 'test-outputs/replay-robust-recording-'))
  记录 = new 测试操作记录(目录)
  await 记录.初始化()
  页面 = await 浏览器.newPage({ viewport: { width: 400, height: 600 } })
  await 页面.route('http://127.0.0.1/app', async (路由) => {
    await 路由.fulfill({ contentType: 'text/html; charset=utf-8', body: 应用HTML })
  })
  引擎 = new 浏览器测试引擎({ 页面, 模式: '自动' })
  let 不使用 = (): never => {
    throw new Error('本用例不使用此工具')
  }
  let 工具: 需求测试工具 = {
    取消信号: new AbortController().signal,
    服务地址: (): string => 'http://127.0.0.1',
    浏览器: { 打开: async () => 引擎, 获得: () => 引擎, 列出: () => ['a'], 关闭: async () => {} },
    Android: { 打开: 不使用, 获得: 不使用 },
    iOS: { 打开: 不使用, 获得: 不使用, 确保会话可用: 不使用 },
    数据库: { 查询: 不使用, 执行: 不使用, 表结构: 不使用 },
    HTTP: { 请求: 不使用 },
    后端日志: { 读取: () => ({ 标准输出: '', 错误输出: '' }) },
  }
  let 宿主: MCP测试工具宿主 = {
    操作记录: 记录,
    执行工具: async (执行) => await 执行(),
    重置数据库: 不使用,
    执行: async (执行) => ({ 结果: { 成功: true, 值: await 执行(工具, (): void => {}) }, 附件们: [], 取证错误们: [] }),
    获得测试地址: () => 测试地址,
    获得设备: () => ({ 安卓: undefined, 苹果: undefined }),
    读取后端日志: () => ({ 标准输出: '', 错误输出: '' }),
    获得输出目录: () => 目录,
  }
  MCP = await 启动测试MCP(宿主, 0)
})

afterAll(async () => {
  if (MCP !== null) await MCP.关闭()
  await 浏览器?.close()
  if (目录 !== '') await rm(目录, { recursive: true, force: true })
})

async function 回放(编号: number, 资源前缀 = 'replay'): Promise<void> {
  let 条目 = await 记录.获得(编号)
  if (条目.kind !== 'call') throw new Error('需要调用记录')
  // 导出前模板路径要换成绝对路径，和真实导出一致
  let [步骤] = await 记录.准备导出([{ 条目编号们: [编号] }])
  let 导出条目 = 步骤?.条目们[0]
  if (导出条目?.kind !== 'call') throw new Error('需要调用记录')
  let 代码 = 生成调用代码(导出条目, { 需要结果: false, 测试地址, 流程文件名前缀: 资源前缀 })
  // 流程文件里的 import.meta.url 换成记录目录下的位置，等价于模板复制到 assets 后相对流程文件解析
  let 语句 = 代码.语句们
    .join('\n')
    .replace(/new URL\("assets\/[^"]+", import\.meta\.url\)/u, (): string =>
      JSON.stringify(path.join(目录, 'templates', `op-${String(编号)}.png`)),
    )
  let 执行: unknown = runInThisContext(`(async (当前状态) => { ${语句} })`)
  if (typeof 执行 !== 'function') throw new Error('生成代码未产生回放函数')
  await 执行({ 工具: { 浏览器: { 获得: (): 浏览器测试引擎 => 引擎 } } })
}

describe('坐标点击录制时自动识别落点（真实浏览器 + MCP）', () => {
  it('点中 aria-label 按钮：记下定位和地址变化，MCP 返回识别说明，导出后按元素点击并等地址', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    await 打开应用()
    let 结果 = await 调用('browser_click_at', { name: 'a', x: 80, y: 45, observe: false })
    expect(结果.error).toBeUndefined()
    let 条目 = await 记录.获得(结果.recordId)
    if (条目.kind !== 'call') throw new Error('需要调用记录')
    expect(条目.增强?.定位).toMatchObject({ 种类: '选择器', 值: 'button[aria-label="去礼物页"]' })
    expect(条目.增强?.地址变化).toEqual({ 前: '/app', 后: '/app#/gift' })
    expect(条目.suggestions).toBeUndefined()
    // 业务结果不混入增强信息
    expect(条目.status === 'passed' ? 条目.result : {}).toEqual({ clicked: true })
    // 回放：先回到初始页，导出代码按元素点击并等到地址
    await 打开应用()
    expect(页面.url()).toBe('http://127.0.0.1/app')
    await 回放(结果.recordId)
    expect(页面.url()).toBe('http://127.0.0.1/app#/gift')
  })

  it('MCP 返回里有一句短说明', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    await 打开应用()
    let 响应 = await fetch(MCP?.地址 ?? '', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'browser_click_at', arguments: { name: 'a', x: 80, y: 45, observe: false } },
      }),
    })
    expect(await 响应.text()).toContain('已识别为 按钮「去礼物页」')
  })

  it('点中 Canvas：没有唯一标签，记下图片模板和建议；回放时用模板找到并点中', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    await 打开应用()
    // 画布里红圆 GO 的位置：画布左上 (21,201)，圆心 (100,60) → 页面 (121, 261)
    let 结果 = await 调用('browser_click_at', { name: 'a', x: 121, y: 261, observe: false })
    expect(结果.error).toBeUndefined()
    let 条目 = await 记录.获得(结果.recordId)
    if (条目.kind !== 'call') throw new Error('需要调用记录')
    expect(条目.增强?.定位).toBeUndefined()
    expect(条目.增强?.模板).toMatchObject({ 比例: 1, 原坐标: { x: 121, y: 261 }, 落点: { x: 32, y: 32 } })
    expect(条目.增强?.模板?.文件).toBe(`templates/op-${String(结果.recordId)}.png`)
    expect((await sharp(await readFile(path.join(目录, 条目.增强?.模板?.文件 ?? ''))).metadata()).width).toBe(64)
    let [建议] = 条目.suggestions ?? []
    expect(建议?.现象).toContain('坐标 (121, 261) 点中的是 <canvas>')
    expect(建议?.现象).toContain('没有唯一标签')
    expect(建议?.改进方向).toContain('aria-label')
    expect(await 页面.locator('#out').textContent()).toBe('画布已点')
    // 回放：页面重新加载（画布未点），用模板在原坐标附近找到并点击
    await 打开应用()
    expect(await 页面.locator('#out').textContent()).toBe('未点')
    await 回放(结果.recordId)
    expect(await 页面.locator('#out').textContent()).toBe('画布已点')
    // 目标位置整体平移 30 像素后（画布移位）仍能找到
    await 打开应用()
    await 页面.addStyleTag({ content: '#stage { left: 50px !important; top: 220px !important }' })
    await 回放(结果.recordId)
    expect(await 页面.locator('#out').textContent()).toBe('画布已点')
  })

  it('点中纯色空白：不做模板、退回坐标，并记建议', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    await 打开应用()
    let 结果 = await 调用('browser_click_at', { name: 'a', x: 300, y: 500, observe: false })
    let 条目 = await 记录.获得(结果.recordId)
    if (条目.kind !== 'call') throw new Error('需要调用记录')
    expect(条目.增强).toBeUndefined()
    expect(条目.suggestions?.[0]?.影响).toContain('纯色')
    await 回放(结果.recordId)
  })

  it('观察开着时返回多帧图片，识别不影响观察，操作前截图用来裁模板', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    await 打开应用()
    let 结果 = await 调用('browser_click_at', { name: 'a', x: 121, y: 261 })
    expect(结果.error).toBeUndefined()
    expect(结果.result).toMatchObject({ clicked: true, settled: true })
    let 条目 = await 记录.获得(结果.recordId)
    if (条目.kind !== 'call') throw new Error('需要调用记录')
    expect(条目.增强?.模板).toBeDefined()
  })
})
