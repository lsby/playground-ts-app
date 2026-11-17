import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { watch } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { 优雅关闭测试服务进程, 等待测试进程输出, 观察测试进程关闭 } from '../../scripts/test/test-process'
import { 测试服务 } from '../../scripts/test/test-server'
import { 测试服务关闭消息 } from '../../src/test-tools/test-service-protocol'

let 配置 = vi.hoisted(() => {
  let 环境: Record<string, string> = {}
  return { 参数: new Array<string>(), 环境 }
})
vi.mock('../../scripts/task/taskfile/taskfile-test', () => ({
  测试任务表: {
    'test:requirement:server': {
      说明: '受控 HTTP 子进程',
      运行: { 程序: 'tsx', 参数: 配置.参数 },
      环境变量: 配置.环境,
    },
  },
}))
vi.mock('../../scripts/task/taskfile/taskfile-dev', () => ({ 开发任务表: {} }))

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 临时目录们: string[] = []
let 服务们: 测试服务[] = []
let 进程们: { 进程: ChildProcess; 关闭: ReturnType<typeof 观察测试进程关闭> }[] = []
let 原端口 = process.env['APP_PORT']
let 原环境文件 = process.env['ENV_FILE_PATH']

afterAll(async (): Promise<void> => {
  await Promise.allSettled(服务们.map((服务) => 服务.关闭()))
  await Promise.allSettled(进程们.map(({ 进程, 关闭 }) => 优雅关闭测试服务进程(进程, 关闭, 100)))
  for (let 目录 of 临时目录们) {
    let 相对路径 = path.relative(path.join(项目根目录, 'test-outputs'), 目录)
    if (相对路径 === '' || 相对路径.startsWith('..') || path.isAbsolute(相对路径)) throw new Error('测试清理路径越界')
    await rm(目录, { recursive: true, force: true })
  }
  if (原端口 === undefined) delete process.env['APP_PORT']
  else process.env['APP_PORT'] = 原端口
  if (原环境文件 === undefined) delete process.env['ENV_FILE_PATH']
  else process.env['ENV_FILE_PATH'] = 原环境文件
})

async function 绑定并关闭(端口 = 0): Promise<number> {
  let 服务 = createServer()
  try {
    let 就绪 = once(服务, 'listening')
    服务.listen(端口, '127.0.0.1')
    await 就绪
    let 地址 = 服务.address()
    if (地址 === null || typeof 地址 === 'string') throw new Error('测试 HTTP 服务没有端口')
    return 地址.port
  } finally {
    if (服务.listening) {
      let 已关闭 = once(服务, 'close')
      服务.close()
      await 已关闭
    }
  }
}

async function 准备(
  模式: 'normal' | 'never-ready' | 'failed' | 'ignore' = 'normal',
): Promise<{ 目录: string; 脚本: string; 端口: number }> {
  await mkdir(path.join(项目根目录, 'test-outputs'), { recursive: true })
  let 目录 = await mkdtemp(path.join(项目根目录, 'test-outputs/test-service-lifecycle-'))
  临时目录们.push(目录)
  let 脚本 = path.join(目录, 'http-service.ts')
  let 端口 = await 绑定并关闭()
  await writeFile(
    脚本,
    `import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
let 模式 = process.env['FIXTURE_MODE'];
if (模式 === undefined || ['normal', 'never-ready', 'failed', 'ignore'].includes(模式) === false) throw new Error('缺少或无效 FIXTURE_MODE');
let 请求次数 = 0;
let 服务 = createServer((_请求, 响应) => 响应.end('ready'));
process.on('message', (消息) => {
  if (消息 !== ${JSON.stringify(测试服务关闭消息)}) return;
  请求次数 += 1;
  if (模式 === 'ignore') return;
  服务.close(() => {
    writeFileSync(${JSON.stringify(path.join(目录, 'closed.json'))}, JSON.stringify({ 请求次数 }));
    process.exit(模式 === 'failed' ? 7 : 0);
  });
});
服务.listen(Number(process.env['APP_PORT']), '127.0.0.1', () => {
  writeFileSync(${JSON.stringify(path.join(目录, 'started.json'))}, JSON.stringify({ pid: process.pid, ppid: process.ppid, argv: process.argv }));
  if (模式 !== 'never-ready') console.log('TEST_SERVER_READY');
  process.send?.({ type: 'started' });
});
`,
  )
  配置.参数.splice(0, 配置.参数.length, 脚本)
  配置.环境['FIXTURE_MODE'] = 模式
  process.env['APP_PORT'] = String(端口)
  process.env['ENV_FILE_PATH'] = path.join(目录, '.env.test')
  return { 目录, 脚本, 端口 }
}

describe.sequential('测试服务真实子进程生命周期', () => {
  it('直接启动 Taskfile 的实际 tsx 入口，关闭后立即重新绑定同端口', async (): Promise<void> => {
    let { 目录, 端口 } = await 准备()
    let 服务 = new 测试服务(项目根目录, 目录)
    服务们.push(服务)
    let 地址 = await 服务.启动()
    expect(await (await fetch(地址)).text()).toBe('ready')
    let 身份 = z
      .object({ pid: z.number(), ppid: z.number(), argv: z.array(z.string()) })
      .parse(JSON.parse(await readFile(path.join(目录, 'started.json'), 'utf8')))
    expect(身份.ppid).toBe(process.pid)
    expect(身份.argv[1]).toBe(path.join(目录, 'http-service.ts'))
    await Promise.all([服务.关闭(), 服务.关闭()])
    expect(
      z
        .object({ 请求次数: z.number().int() })
        .parse(JSON.parse(await readFile(path.join(目录, 'closed.json'), 'utf8'))),
    ).toEqual({ 请求次数: 1 })
    expect(await 绑定并关闭(端口)).toBe(端口)
  }, 20000)

  it('启动期间取消仍等待真实 HTTP 关闭', async (): Promise<void> => {
    let { 目录, 端口 } = await 准备('never-ready')
    let 服务 = new 测试服务(项目根目录, 目录)
    服务们.push(服务)
    let 文件已创建 = Promise.withResolvers<void>()
    let 监听 = watch(目录, (_事件, 文件名): void => {
      if (文件名 === 'started.json') 文件已创建.resolve()
    })
    try {
      let 启动 = 服务.启动()
      let 启动失败 = expect(启动).rejects.toThrow('已取消')
      await 文件已创建.promise
      await 服务.关闭()
      await 启动失败
      expect(await 绑定并关闭(端口)).toBe(端口)
    } finally {
      监听.close()
    }
  }, 20000)

  it('服务关闭返回非零码必须报告失败，HTTP 仍已释放', async (): Promise<void> => {
    let { 目录, 端口 } = await 准备('failed')
    let 服务 = new 测试服务(项目根目录, 目录)
    服务们.push(服务)
    await 服务.启动()
    let 关闭错误 = await 服务.关闭().then(
      (): null => null,
      (错误: unknown): unknown => 错误,
    )
    let 原因们 = z.array(z.object({ message: z.string() })).parse(z.instanceof(AggregateError).parse(关闭错误).errors)
    expect(原因们.some((原因): boolean => 原因.message.includes('退出码：7'))).toBe(true)
    expect(await 绑定并关闭(端口)).toBe(端口)
  }, 20000)

  it('关闭消息无响应时有限时清理本次进程且明确报超时', async (): Promise<void> => {
    let { 脚本, 端口 } = await 准备('ignore')
    let 进程 = spawn(process.execPath, ['--import', 'tsx', 脚本], {
      cwd: 项目根目录,
      env: { ...process.env, FIXTURE_MODE: 'ignore' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    })
    let 关闭 = 观察测试进程关闭(进程)
    进程们.push({ 进程, 关闭 })
    await 等待测试进程输出(进程, 'TEST_SERVER_READY')
    await expect(优雅关闭测试服务进程(进程, 关闭, 100)).rejects.toThrow('关闭超时')
    expect(await 绑定并关闭(端口)).toBe(端口)
  }, 20000)

  it('创建进程失败也返回明确错误而非悬挂等待', async (): Promise<void> => {
    let { 目录 } = await 准备()
    let 进程 = spawn(path.join(目录, 'missing-node.exe'), [], { windowsHide: true })
    let 关闭 = 观察测试进程关闭(进程)
    await expect(优雅关闭测试服务进程(进程, 关闭, 1000)).rejects.toThrow('进程发生错误')
  })
})
