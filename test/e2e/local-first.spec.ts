import { expect, Page, test } from '@playwright/test'
import { z } from 'zod'
import { cleanDB } from '../../scripts/db/clean-db'
import { 环境变量 } from '../../src/global/env'
import { kysely管理器 } from '../../src/global/global'
import { init } from '../../src/init/init'
import { 数据库快照模式 } from '../../src/model/local-first/sync-model'

let 本地优先状态模式 = z
  .object({
    currentFileName: z.string().min(1),
    baselineFileName: z.string().min(1),
    userId: z.string().min(1),
    schemaFingerprint: z.string().min(1),
    tables: z.array(z.string().min(1)),
  })
  .strict()
let 本地优先状态表模式 = z.record(z.string(), 本地优先状态模式)
let Worker接口响应模式 = z.object({ status: z.enum(['success', 'fail', 'unexpected']), data: z.unknown() }).strict()
let 用户配置响应模式 = z
  .object({
    status: z.literal('success'),
    data: z.object({ id: z.string(), theme: z.enum(['系统', '亮色', '暗色']) }).strict(),
  })
  .strict()
let 数据库对响应模式 = z
  .object({
    status: z.literal('success'),
    data: z
      .object({
        当前Schema指纹: z.string(),
        基线Schema指纹: z.string(),
        当前数据库: 数据库快照模式,
        基线数据库: 数据库快照模式,
      })
      .strict(),
  })
  .strict()

type Worker请求 =
  | {
      path: string
      headers: Record<string, string>
      method: string
      body: string
      databaseFileName: string
      localFirstUserId: string
    }
  | { command: 'read-sync-pair'; databaseFileName: string; baselineFileName: string; tables: string[] }

async function 登录(page: Page): Promise<void> {
  await page.goto('/login.html')
  await page.getByRole('textbox', { name: '用户名' }).fill(环境变量.DEFAULT_SYSTEM_USER)
  await page.getByRole('textbox', { name: '密码' }).fill(环境变量.DEFAULT_SYSTEM_PWD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/index.html')
  await expect(page.getByRole('heading', { name: '项目首页' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/)
}

async function 读取状态(page: Page, 用户id: string): Promise<z.infer<typeof 本地优先状态模式>> {
  let 原始状态表 = await page.evaluate((): string => {
    let 状态键列表 = Object.keys(localStorage).filter((键) => 键.endsWith('-local-first-state-by-user'))
    if (状态键列表.length !== 1) throw new Error(`预期存在一个本地优先状态键，实际为 ${String(状态键列表.length)} 个`)
    let 状态键 = 状态键列表[0]
    if (状态键 === undefined) throw new Error('未找到本地优先状态键')
    let 内容 = localStorage.getItem(状态键)
    if (内容 === null) throw new Error('本地优先状态内容不存在')
    return 内容
  })
  let 状态表 = 本地优先状态表模式.parse(JSON.parse(原始状态表))
  let 状态 = 状态表[用户id]
  if (状态 === undefined) throw new Error(`未找到用户 ${用户id} 的本地优先状态`)
  return 状态
}

async function 请求Worker(
  page: Page,
  数据库文件名: string,
  请求: Worker请求,
): Promise<z.infer<typeof Worker接口响应模式>> {
  let 响应正文 = await page.evaluate(
    async ({ 文件名, 消息 }): Promise<string> => {
      let Worker键 = '__local_first_e2e_worker__'
      let Worker文件名键 = '__local_first_e2e_worker_file__'
      let 已有Worker: unknown = Reflect.get(globalThis, Worker键)
      let worker: Worker
      if (已有Worker instanceof Worker) {
        worker = 已有Worker
        if (Reflect.get(globalThis, Worker文件名键) !== 文件名) throw new Error('E2E Worker 不能切换数据库文件')
      } else {
        window.dispatchEvent(new Event('pagehide'))
        let url = new URL('/worker-assets/pure-frontend-api-worker.js', location.href)
        url.searchParams.set('databaseFileName', 文件名)
        worker = new Worker(url, { type: 'module', name: 'local-first-e2e' })
        Reflect.set(globalThis, Worker键, worker)
        Reflect.set(globalThis, Worker文件名键, 文件名)
      }
      let id = Date.now() + Math.floor(Math.random() * 100000)
      return await new Promise<string>((resolve, reject) => {
        let 清理 = (): void => {
          worker.removeEventListener('message', 处理消息)
          worker.removeEventListener('error', 处理错误)
        }
        let 处理消息 = (事件: MessageEvent): void => {
          let 数据: unknown = 事件.data
          if (typeof 数据 !== 'object' || 数据 === null || Reflect.get(数据, 'id') !== id) return
          let body: unknown = Reflect.get(数据, 'body')
          清理()
          if (typeof body !== 'string') {
            reject(new Error('Worker 响应缺少字符串 body'))
            return
          }
          resolve(body)
        }
        let 处理错误 = (事件: ErrorEvent): void => {
          清理()
          reject(事件.error instanceof Error ? 事件.error : new Error(事件.message))
        }
        worker.addEventListener('message', 处理消息)
        worker.addEventListener('error', 处理错误)
        worker.postMessage({ id, ...消息 })
      })
    },
    { 文件名: 数据库文件名, 消息: 请求 },
  )
  return Worker接口响应模式.parse(JSON.parse(响应正文))
}

async function 终止测试Worker(page: Page): Promise<void> {
  await page.evaluate((): void => {
    let Worker键 = '__local_first_e2e_worker__'
    let Worker文件名键 = '__local_first_e2e_worker_file__'
    let worker: unknown = Reflect.get(globalThis, Worker键)
    if (worker instanceof Worker) worker.terminate()
    Reflect.deleteProperty(globalThis, Worker键)
    Reflect.deleteProperty(globalThis, Worker文件名键)
  })
}

test.describe('本地优先模式 E2E', (): void => {
  test.beforeEach(async (): Promise<void> => {
    await cleanDB(kysely管理器.获得句柄())
    await init()
  })

  test('本地修改在显式同步后提交并刷新当前库与基线库', async ({ page, context }): Promise<void> => {
    let 数据库 = kysely管理器.获得句柄()
    let 管理员 = await 数据库
      .selectFrom('user')
      .select('id')
      .where('name', '=', 环境变量.DEFAULT_SYSTEM_USER)
      .executeTakeFirst()
    if (管理员 === undefined) throw new Error('初始化后未找到管理员')

    await 登录(page)
    let 状态 = await 读取状态(page, 管理员.id)
    let 初始服务端配置 = await 数据库
      .selectFrom('user_config')
      .select('theme')
      .where('user_id', '=', 管理员.id)
      .executeTakeFirst()
    expect(初始服务端配置?.theme).toBe('系统')

    let 更新结果 = await 请求Worker(page, 状态.currentFileName, {
      path: '/api/user/update-user-config',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ theme: '暗色' }),
      databaseFileName: 状态.currentFileName,
      localFirstUserId: 管理员.id,
    })
    expect(更新结果.status).toBe('success')
    let 本地读取结果 = await 请求Worker(page, 状态.currentFileName, {
      path: '/api/user/get-user-config',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      body: '{}',
      databaseFileName: 状态.currentFileName,
      localFirstUserId: 管理员.id,
    })
    expect(用户配置响应模式.parse(本地读取结果).data.theme).toBe('暗色')

    let 同步前服务端配置 = await 数据库
      .selectFrom('user_config')
      .select('theme')
      .where('user_id', '=', 管理员.id)
      .executeTakeFirst()
    expect(同步前服务端配置?.theme).toBe('系统')

    await context.setOffline(true)
    try {
      let 离线读取结果 = await 请求Worker(page, 状态.currentFileName, {
        path: '/api/user/get-user-config',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        body: '{}',
        databaseFileName: 状态.currentFileName,
        localFirstUserId: 管理员.id,
      })
      expect(用户配置响应模式.parse(离线读取结果).data.theme).toBe('暗色')
    } finally {
      await context.setOffline(false)
    }

    await 终止测试Worker(page)
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await page.waitForURL('**/login.html')
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()

    let 同步后服务端配置 = await 数据库
      .selectFrom('user_config')
      .select('theme')
      .where('user_id', '=', 管理员.id)
      .executeTakeFirst()
    expect(同步后服务端配置?.theme).toBe('暗色')

    let 同步后状态 = await 读取状态(page, 管理员.id)
    expect(同步后状态.currentFileName).not.toBe(状态.currentFileName)
    expect(同步后状态.baselineFileName).not.toBe(状态.baselineFileName)
    let 数据库对结果 = await 请求Worker(page, 同步后状态.currentFileName, {
      command: 'read-sync-pair',
      databaseFileName: 同步后状态.currentFileName,
      baselineFileName: 同步后状态.baselineFileName,
      tables: 同步后状态.tables,
    })
    let 数据库对 = 数据库对响应模式.parse(数据库对结果).data
    expect(数据库对.当前Schema指纹).toBe(同步后状态.schemaFingerprint)
    expect(数据库对.基线Schema指纹).toBe(同步后状态.schemaFingerprint)
    expect(数据库对.当前数据库['user_config']?.[0]?.['theme']).toBe('暗色')
    expect(数据库对.基线数据库['user_config']?.[0]?.['theme']).toBe('暗色')
    await 终止测试Worker(page)
  })

  test('远程数据变化时自动重试并在第三次提交成功', async ({ page }): Promise<void> => {
    await 登录(page)
    let 提交次数 = 0
    await page.route('**/api/system/local-first/push', async (路由): Promise<void> => {
      提交次数 += 1
      if (提交次数 < 3) {
        await 路由.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'fail',
            data: { code: 'REMOTE_DATA_CHANGED', message: 'E2E 模拟远程数据变化' },
          }),
        })
        return
      }
      await 路由.continue()
    })

    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await page.waitForURL('**/login.html')
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
    expect(提交次数).toBe(3)
  })

  test('同字段冲突时中止上传并保留远程数据', async ({ page }): Promise<void> => {
    let 数据库 = kysely管理器.获得句柄()
    let 管理员 = await 数据库
      .selectFrom('user')
      .select('id')
      .where('name', '=', 环境变量.DEFAULT_SYSTEM_USER)
      .executeTakeFirst()
    if (管理员 === undefined) throw new Error('初始化后未找到管理员')

    await 登录(page)
    let 状态 = await 读取状态(page, 管理员.id)
    let 更新结果 = await 请求Worker(page, 状态.currentFileName, {
      path: '/api/user/update-user-config',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ theme: '暗色' }),
      databaseFileName: 状态.currentFileName,
      localFirstUserId: 管理员.id,
    })
    expect(更新结果.status).toBe('success')
    await 终止测试Worker(page)
    await 数据库.updateTable('user_config').set({ theme: '亮色' }).where('user_id', '=', 管理员.id).execute()

    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    let 冲突对话框 = page.getByRole('dialog', { name: /本地优先同步失败/ })
    await expect(冲突对话框).toContainText('本地优先同步已取消: data-conflict')
    await 冲突对话框.getByRole('button', { name: '确定', exact: true }).click()
    await page.waitForURL('**/login.html')
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()

    let 服务端配置 = await 数据库
      .selectFrom('user_config')
      .select('theme')
      .where('user_id', '=', 管理员.id)
      .executeTakeFirst()
    expect(服务端配置?.theme).toBe('亮色')
    let 冲突后状态 = await 读取状态(page, 管理员.id)
    expect(冲突后状态.currentFileName).toBe(状态.currentFileName)
    expect(冲突后状态.baselineFileName).toBe(状态.baselineFileName)
  })
})
