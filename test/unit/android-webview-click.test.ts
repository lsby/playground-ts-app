import { chromium, expect as 网页断言, type Page } from '@playwright/test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { 格式化需求测试错误 } from '../../scripts/test/requirement/format-error'
import { 执行ADB } from '../../src/model/android-test/adb'
import { 安卓网页会话 } from '../../src/model/android-test/webview'

vi.mock('../../src/model/android-test/adb', () => ({ 执行ADB: vi.fn() }))

let 会话: 安卓网页会话 | undefined

afterEach(async (): Promise<void> => {
  await 会话?.关闭()
  会话 = undefined
  vi.restoreAllMocks()
})

async function 准备页面(检查: (页面: Page, 次数: number) => Promise<void>): Promise<Page> {
  let 浏览器 = await chromium.launch({ headless: true })
  let 页面 = await 浏览器.newPage({ viewport: { width: 480, height: 400 } })
  await 页面.route('http://127.0.0.1/click-test', async (路由): Promise<void> => {
    await 路由.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<meta name="viewport" content="width=device-width,initial-scale=1">
        <button style="position:fixed;bottom:20px;left:20px;width:200px;height:60px"
          onclick="this.textContent='发送完成'">发送验证码</button>`,
    })
  })
  await 页面.goto('http://127.0.0.1/click-test')
  vi.mocked(执行ADB).mockImplementation(async (参数): Promise<Buffer> => {
    return Buffer.from(参数.includes('pidof') ? '1234' : '4567')
  })
  vi.spyOn(chromium, 'connectOverCDP').mockResolvedValue(浏览器)
  let 次数 = 0
  会话 = new 安卓网页会话(
    'test-device',
    'com.example.mobiletest.localtest',
    new AbortController().signal,
    async (): Promise<void> => {
      次数 += 1
      await 检查(页面, 次数)
    },
    'http://127.0.0.1',
  )
  return 页面
}

describe('Android WebView 真实触摸', () => {
  it('断开连接失败仍移除转发，完整报告两个清理错误及设备端口', async (): Promise<void> => {
    let 页面 = await 准备页面(async (): Promise<void> => {})
    if (会话 === undefined) throw new Error('缺少测试会话')
    await 会话.观察()
    let 浏览器 = 页面.context().browser()
    if (浏览器 === null) throw new Error('缺少测试浏览器')
    let 关闭 = vi.spyOn(浏览器, 'close').mockRejectedValue(new Error('CDP 已断线'))
    vi.mocked(执行ADB).mockRejectedValue(new Error('device test-device not found'))
    let 当前会话 = 会话
    会话 = undefined
    try {
      let 关闭任务 = 当前会话.关闭()
      await expect(关闭任务).rejects.toThrow('关闭 Android WebView 会话失败')
      await 关闭任务.catch((错误: unknown): void => {
        let 输出 = 格式化需求测试错误(错误, '').文本
        expect(输出).toContain('断开 Android WebView 连接失败（设备 test-device）')
        expect(输出).toContain('CDP 已断线')
        expect(输出).toContain('adb -s test-device forward --remove tcp:4567')
        expect(输出).toContain('device test-device not found')
      })
      expect(执行ADB).toHaveBeenLastCalledWith(
        ['-s', 'test-device', 'forward', '--remove', 'tcp:4567'],
        expect.any(AbortSignal),
      )
    } finally {
      关闭.mockRestore()
      await 浏览器.close()
    }
  })

  it('前台检查期间键盘收起导致视口变高时，触摸重新定位后的按钮', async (): Promise<void> => {
    let 页面 = await 准备页面(async (当前页面, 次数): Promise<void> => {
      if (次数 === 3) await 当前页面.setViewportSize({ width: 480, height: 900 })
    })
    if (会话 === undefined) throw new Error('缺少测试会话')
    await 会话.点击({ 按: '网页文字', 值: '发送验证码' }, 1000)
    await 网页断言(页面.getByRole('button')).toHaveText('发送完成', { timeout: 1000 })
  })

  it('前台检查失败时不发送触摸', async (): Promise<void> => {
    let 页面 = await 准备页面(async (_页面, 次数): Promise<void> => {
      if (次数 === 3) throw new Error('前台已离开测试应用')
    })
    if (会话 === undefined) throw new Error('缺少测试会话')
    await expect(会话.点击({ 按: '网页文字', 值: '发送验证码' }, 1000)).rejects.toThrow('前台已离开测试应用')
    await 网页断言(页面.getByRole('button')).toHaveText('发送验证码')
  })
})
