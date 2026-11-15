import { chromium, type Browser, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import path from 'node:path'
import { runInThisContext } from 'node:vm'
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
    throw new Error('不使用业务后端配置')
  },
}))

let 浏览器: Browser | null = null
let 后端: Server | null = null
let 前端: Server | null = null
let MCP: Awaited<ReturnType<typeof 启动测试MCP>> | null = null
let 页面: Page
let 引擎: 浏览器测试引擎
let 记录: 测试操作记录
let 后端地址 = ''
let 前端地址 = ''
let 目录 = ''
let 请求次数 = new Map<string, number>()
let 收到慢请求: (() => void) | null = null
let 释放慢后端: (() => void) | null = null

async function 监听(服务: Server): Promise<string> {
  await new Promise<void>((完成): void => {
    服务.listen(0, '127.0.0.1', 完成)
  })
  let 地址 = 服务.address()
  if (地址 === null || typeof 地址 === 'string') throw new Error('测试服务缺少端口')
  return `http://127.0.0.1:${String(地址.port)}`
}

async function 处理后端(请求: IncomingMessage, 响应: ServerResponse): Promise<void> {
  响应.setHeader('access-control-allow-origin', '*')
  响应.setHeader('access-control-allow-headers', 'content-type, authorization')
  if (请求.method === 'OPTIONS') {
    响应.writeHead(204).end()
    return
  }
  if (请求.method === 'GET') {
    请求次数.set('GET', (请求次数.get('GET') ?? 0) + 1)
    响应.writeHead(200).end('GET bypass')
    return
  }
  let 块们: Buffer[] = []
  for await (let 块 of 请求) 块们.push(z.instanceof(Buffer).parse(块))
  let { name } = z.object({ name: z.string() }).parse(JSON.parse(Buffer.concat(块们).toString()))
  请求次数.set(name, (请求次数.get(name) ?? 0) + 1)
  if (name === 'slow') {
    收到慢请求?.()
    await new Promise<void>((完成): void => {
      释放慢后端 = 完成
    })
  }
  if (name === 'failure') {
    响应.destroy()
    return
  }
  响应.writeHead(207, { 'content-type': 'application/json', 'x-real-response': 'yes' }).end(
    JSON.stringify({ operation: name, real: true }),
  )
}

async function 调用(
  工具: string,
  参数: JSON对象,
): Promise<{ recordId: number; result?: JSON对象 | undefined; error?: string | undefined }> {
  if (MCP === null) throw new Error('MCP 尚未启动')
  let 响应 = await fetch(MCP.地址, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 工具, arguments: 参数 } }),
  })
  let 正文 = await 响应.text()
  let 事件 = 正文.split('\n').find((行): boolean => 行.startsWith('data: '))
  let 数据 = 事件 === undefined ? 正文 : 事件.slice(6)
  return z
    .object({
      result: z.object({
        structuredContent: z.object({
          recordId: z.number(),
          result: JSON对象模式.optional(),
          error: z.string().optional(),
        }),
      }),
    })
    .parse(JSON.parse(数据)).result.structuredContent
}

async function 新页面(信号?: AbortSignal): Promise<void> {
  if (浏览器 === null) throw new Error('浏览器尚未启动')
  页面 = await 浏览器.newPage()
  引擎 = new 浏览器测试引擎({ 页面, 模式: '自动', ...(信号 === undefined ? {} : { 取消信号: 信号 }) })
  await 页面.goto(前端地址)
  await 页面.setContent(`<button id="send" onclick="send('accept','result')">请求</button>
    <button id="leave" onclick="location.hash='profile'">离开</button>
    <div id="result"></div><div id="other"></div><script>
    async function send(name,id){try{let response=await fetch('${后端地址}/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});document.getElementById(id).textContent=await response.text()}catch{document.getElementById(id).textContent='cancelled'}}
    </script>`)
}

async function 回放(编号: number): Promise<void> {
  let 条目 = await 记录.获得(编号)
  if (条目.kind !== 'call') throw new Error('必须是调用记录')
  let 代码 = 生成调用代码(条目, { 需要结果: true, 测试地址: { 前端: 前端地址, 后端: 后端地址 } })
  let 执行: unknown = runInThisContext(`(async (当前状态) => { ${代码.语句们.join('\n')} })`)
  if (typeof 执行 !== 'function') throw new Error('未生成回放函数')
  z.void().parse(
    await 执行({
      工具: { 服务地址: (): string => 后端地址, 浏览器: { 获得: (): 浏览器测试引擎 => 引擎 } },
      结果们: new Map(),
    }),
  )
}

beforeAll(async () => {
  let 输出根 = path.resolve(import.meta.dirname, '../../test-outputs')
  await mkdir(输出根, { recursive: true })
  目录 = await mkdtemp(path.join(输出根, 'browser-request-hold-'))
  记录 = new 测试操作记录(目录)
  await 记录.初始化()
  后端 = createServer((请求, 响应): void => {
    void 处理后端(请求, 响应).catch((): void => {
      响应.writeHead(500).end()
    })
  })
  前端 = createServer((_请求, 响应): void => {
    响应.writeHead(200, { 'content-type': 'text/html' }).end('<html><body></body></html>')
  })
  后端地址 = await 监听(后端)
  前端地址 = await 监听(前端)
  浏览器 = await chromium.launch({ headless: true })
  let 不使用 = (): never => {
    throw new Error('不使用此工具')
  }
  let 工具: 需求测试工具 = {
    取消信号: new AbortController().signal,
    服务地址: (): string => 前端地址,
    浏览器: {
      打开: 不使用,
      获得: (): 浏览器测试引擎 => 引擎,
      列出: (): string[] => ['挂起'],
      关闭: async (): Promise<void> => 页面.close(),
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
    获得测试地址: (): { 前端: string; 后端: string } => ({ 前端: 前端地址, 后端: 后端地址 }),
    获得设备: (): { 安卓: undefined; 苹果: undefined } => ({ 安卓: undefined, 苹果: undefined }),
    读取后端日志: (): { 标准输出: string; 错误输出: string } => ({ 标准输出: '', 错误输出: '' }),
    获得输出目录: (): string => 目录,
  }
  MCP = await 启动测试MCP(宿主, 0)
})

afterAll(async () => {
  释放慢后端?.()
  if (MCP !== null) await MCP.关闭()
  if (浏览器 !== null) await 浏览器.close()
  for (let 服务 of [后端, 前端])
    if (服务 !== null)
      await new Promise<void>((完成, 拒绝): void => {
        服务.close((错误): void => {
          if (错误 === undefined) 完成()
          else 拒绝(错误)
        })
      })
  if (目录 !== '')
    await writeFile(
      path.join(目录, 'summary.json'),
      JSON.stringify({ 请求次数: Object.fromEntries(请求次数), 前端地址, 后端地址 }, null, 2),
    )
})

describe('真实浏览器请求挂起', () => {
  it('MCP录制并导出回放同一跨端口后端响应，离开后释放，不改真实状态及正文', async () => {
    await 新页面()
    let 安装 = await 调用('browser_request_hold', {
      name: '挂起',
      requestId: 'late',
      path: '/api/action',
      bodyMatch: { name: 'accept' },
    })
    let 点击 = await 调用('browser_click', {
      name: '挂起',
      target: { by: 'selector', selector: '#send' },
      observe: false,
    })
    let 取得 = await 调用('browser_request_wait', {
      name: '挂起',
      requestId: 'late',
      state: 'response-ready',
      timeoutMs: 5000,
    })
    expect(取得.error).toBeUndefined()
    expect(取得.result).toMatchObject({
      phase: 'response-ready',
      status: 207,
      captured: 1,
      finished: 0,
      bodySha256: createHash('sha256')
        .update(JSON.stringify({ operation: 'accept', real: true }))
        .digest('hex'),
    })
    expect(await 页面.locator('#result').textContent()).toBe('')
    let 离开 = await 调用('browser_click', {
      name: '挂起',
      target: { by: 'selector', selector: '#leave' },
      observe: false,
    })
    let 放行 = await 调用('browser_request_release', { name: '挂起', requestId: 'late', timeoutMs: 5000 })
    expect(放行.result).toMatchObject({ phase: 'finished', status: 207, captured: 1, finished: 1 })
    await 页面.locator('#result').filter({ hasText: '"real":true' }).waitFor()
    expect(页面.url()).toContain('#profile')
    expect(请求次数.get('accept')).toBe(1)
    await 页面.close()
    await 新页面()
    for (let 项 of [安装, 点击, 取得, 离开, 放行]) {
      expect(项.error).toBeUndefined()
      await 回放(项.recordId)
    }
    await 页面.locator('#result').filter({ hasText: '"real":true' }).waitFor()
    expect(页面.url()).toContain('#profile')
    expect(请求次数.get('accept')).toBe(2)
    await 页面.close()
  })

  it('同一接口的其他函数、方法和路径旁路，规则只捕获一次', async () => {
    await 新页面()
    await 引擎.挂起请求({ 标识: 'once', 路径: '/api/action', 请求正文匹配: { name: 'accept' }, 后端地址 })
    await 页面.evaluate(async (地址): Promise<void> => {
      await fetch(`${地址}/api/action`)
      await fetch(`${地址}/api/other`, { method: 'POST', body: JSON.stringify({ name: 'other-path' }) })
      await fetch(`${地址}/api/action`, { method: 'POST', body: JSON.stringify({ name: 'other-name' }) })
    }, 后端地址)
    await 页面.click('#send')
    await 引擎.等待挂起请求('once', 'response-ready', 5000)
    await 引擎.释放挂起请求('once', 5000)
    await 页面.evaluate(async (地址): Promise<void> => {
      await fetch(`${地址}/api/action`, { method: 'POST', body: JSON.stringify({ name: 'accept' }) })
    }, 后端地址)
    expect(请求次数.get('accept')).toBe(4)
    expect(请求次数.get('other-name')).toBe(1)
    expect(请求次数.get('other-path')).toBe(1)
    expect(请求次数.get('GET')).toBe(1)
    await 页面.close()
  })

  it('未捕获、未就绪、未知规则与重复标识明确报错，不增加请求', async () => {
    await 新页面()
    let 规则 = { 标识: 'timeout', 路径: '/api/action', 请求正文匹配: { name: 'never' }, 后端地址 }
    await 引擎.挂起请求(规则)
    await expect(引擎.等待挂起请求('timeout', 'captured', 30)).rejects.toThrow('超时')
    await expect(引擎.释放挂起请求('timeout', 30)).rejects.toThrow('尚未取得')
    await expect(引擎.挂起请求(规则)).rejects.toThrow('已存在')
    await expect(引擎.等待挂起请求('unknown', 'finished', 30)).rejects.toThrow('不存在')
    await expect(引擎.挂起请求({ ...规则, 标识: 'remote', 后端地址: 'https://example.com' })).rejects.toThrow('本机')
    expect(请求次数.has('never')).toBe(false)
    await 页面.close()
  })

  it('关闭页面会拒绝挂起阶段的等待，释放所有等待者', async () => {
    await 新页面()
    await 引擎.挂起请求({ 标识: 'close', 路径: '/api/action', 请求正文匹配: { name: 'accept' }, 后端地址 })
    await 页面.click('#send')
    await 引擎.等待挂起请求('close', 'response-ready', 5000)
    let 等待 = expect(引擎.等待挂起请求('close', 'finished', 5000)).rejects.toThrow('浏览器已关闭')
    await 页面.close()
    await 等待
  })

  it('等待完成超时会中止挂起，上游失败只保留脱敏阶段错误', async () => {
    await 新页面()
    await 引擎.挂起请求({ 标识: 'held-timeout', 路径: '/api/action', 请求正文匹配: { name: 'accept' }, 后端地址 })
    await 页面.click('#send')
    await 引擎.等待挂起请求('held-timeout', 'response-ready', 5000)
    await expect(引擎.等待挂起请求('held-timeout', 'finished', 30)).rejects.toThrow('超时')
    await 页面.locator('#result').filter({ hasText: 'cancelled' }).waitFor()
    await 页面.close()
    await 新页面()
    await 引擎.挂起请求({ 标识: 'upstream-failed', 路径: '/api/action', 请求正文匹配: { name: 'failure' }, 后端地址 })
    await 页面.evaluate((地址): void => {
      void fetch(`${地址}/api/action`, {
        method: 'POST',
        headers: { authorization: 'Bearer synthetic-sensitive' },
        body: JSON.stringify({ name: 'failure' }),
      }).catch((): void => {})
    }, 后端地址)
    await expect(引擎.等待挂起请求('upstream-failed', 'response-ready', 5000)).rejects.toThrow(
      '真实后端请求转发或交付失败',
    )
    await 页面.close()
  })

  it('上游尚未返回时取消，不等待后端完成且迟到响应不会交给页面', async () => {
    let 取消 = new AbortController()
    await 新页面(取消.signal)
    await 引擎.挂起请求({ 标识: 'cancel', 路径: '/api/action', 请求正文匹配: { name: 'slow' }, 后端地址 })
    let 已进入 = new Promise<void>((完成): void => {
      收到慢请求 = 完成
    })
    await 页面.evaluate((地址): void => {
      void fetch(`${地址}/api/action`, { method: 'POST', body: JSON.stringify({ name: 'slow' }) }).catch((): void => {})
    }, 后端地址)
    await 已进入
    let 等待 = expect(引擎.等待挂起请求('cancel', 'response-ready', 5000)).rejects.toThrow('测试会话已取消')
    取消.abort()
    await 等待
    释放慢后端?.()
    await 页面.close()
  })
})
