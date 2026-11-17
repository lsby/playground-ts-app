import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'

let 执行文件 = promisify(execFile)
let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 临时目录们: string[] = []

afterAll(async (): Promise<void> => {
  for (let 目录 of 临时目录们) await rm(目录, { recursive: true, force: true })
})

async function 验证生命周期(代码: string): Promise<void> {
  let 输出目录 = path.join(项目根目录, 'test-outputs')
  await mkdir(输出目录, { recursive: true })
  let 目录 = await mkdtemp(path.join(输出目录, 'browser-lifecycle-'))
  临时目录们.push(目录)
  let 引擎模块 = pathToFileURL(path.join(项目根目录, 'src/model/browser-test/index.ts')).href
  let 脚本 = path.join(目录, 'lifecycle.mjs')
  await writeFile(
    脚本,
    `import assert from 'node:assert/strict';
import { 浏览器测试引擎 } from ${JSON.stringify(引擎模块)};
let 会话们 = [];
async function 打开(参数 = {}) {
  let 会话 = await 浏览器测试引擎.打开会话({ 附件目录: ${JSON.stringify(目录)}, 模式: '自动', 会话名称: '生命周期验证', ...参数 });
  会话们.push(会话); return 会话;
}
try { ${代码} } finally { for (let 会话 of 会话们) await 会话.关闭(); }
console.log('lifecycle passed');`,
  )
  let 输出 = await 执行文件(process.execPath, ['--import', 'tsx', 脚本], { cwd: 项目根目录, timeout: 40_000 })
  expect(输出.stdout.trim()).toBe('lifecycle passed')
}

describe('浏览器引擎生命周期（真实浏览器串行）', () => {
  it('关闭Promise完成前保持占用，关闭完成后可以再开', async (): Promise<void> => {
    await 验证生命周期(`let 会话 = await 打开();
let 浏览器 = 会话.引擎.定位('body').page().context().browser();
assert.ok(浏览器);
let 进入关闭; let 继续关闭;
let 已进入 = new Promise((resolve) => { 进入关闭 = resolve; });
let 继续任务 = new Promise((resolve) => { 继续关闭 = resolve; });
let 原关闭 = 浏览器.close.bind(浏览器);
浏览器.close = async (...参数) => { await 原关闭(...参数); 进入关闭(); await 继续任务; };
let 关闭任务 = 会话.关闭();
await 已进入;
try { await assert.rejects(打开(), /生命周期验证/); } finally { 继续关闭(); await 关闭任务; }
await (await 打开()).关闭();`)
  })

  it('初始导航失败时关闭浏览器并释放占用', async (): Promise<void> => {
    await 验证生命周期(`await assert.rejects(打开({ 初始地址: 'invalid-protocol://failure' }));
await (await 打开()).关闭();`)
  })

  it('取消会话后等待同一个关闭任务，再次打开成功', async (): Promise<void> => {
    await 验证生命周期(`let 控制器 = new AbortController();
let 会话 = await 打开({ 取消信号: 控制器.signal });
控制器.abort(); await 会话.关闭();
await (await 打开()).关闭();`)
  })

  it('意外断开立即释放占用，清理旧会话不释放新会话占用', async (): Promise<void> => {
    await 验证生命周期(`let 会话 = await 打开();
let 浏览器 = 会话.引擎.定位('body').page().context().browser();
assert.ok(浏览器); await 浏览器.close();
let 新会话 = await 打开();
await 会话.关闭(); await 会话.关闭();
await assert.rejects(打开(), /生命周期验证/);
await 新会话.关闭();`)
  })
})
