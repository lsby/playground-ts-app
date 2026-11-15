import { beforeEach, describe, expect, it, vi } from 'vitest'

import { 安卓打开模型 } from '../../scripts/test/mcp/android-input'
import { 生成安卓调用代码 } from '../../scripts/test/requirement/android-operation-code'
import { 安卓测试引擎, 执行ADB } from '../../src/model/android-test'
import { 通知权限状态稳定 } from '../../src/model/android-test/notification-preflight'
import type { JSON对象, 操作调用条目 } from '../../src/test-tools/operation-record'

vi.mock('../../src/model/android-test/adb', () => ({ 执行ADB: vi.fn() }))

let 包名 = 'com.example.mobiletest.localtest'
let 主活动 = `${包名}/com.example.mobiletest.MainActivity`
let 权限活动 =
  'com.google.android.permissioncontroller/com.android.permissioncontroller.permission.ui.GrantPermissionsActivity'
let 命令们: string[] = []
let SDK = '36'
let 窗口 = 'com.android.launcher/.Launcher'
let 权限 = ''

function 包信息(用户: number, granted: boolean, flags: string): string {
  return `Packages:\n  Package [${包名}] (abcdef):\n    User ${String(用户)}: installed=true\n      runtime permissions:\n        android.permission.POST_NOTIFICATIONS: granted=${String(granted)}, flags=[ ${flags} ]\n`
}

function 引擎(): 安卓测试引擎 {
  return new 安卓测试引擎(
    'test-device',
    new AbortController().signal,
    async (): Promise<never> => {
      throw new Error('普通启动不应检查 OCR 程序')
    },
    {
      包名: 'com.example.mobiletest.localtest',
      启动组件: 'com.example.mobiletest.localtest/com.example.mobiletest.MainActivity',
      网页来源: 'https://localhost',
    },
  )
}

beforeEach((): void => {
  命令们 = []
  SDK = '36'
  窗口 = 'com.android.launcher/.Launcher'
  权限 = 包信息(10, true, '')
  vi.mocked(执行ADB).mockImplementation(async (参数): Promise<Buffer> => {
    let 命令 = 参数.slice(2).join(' ')
    命令们.push(命令)
    switch (命令) {
      case 'shell dumpsys window':
        return Buffer.from(`mCurrentFocus=Window{abc u10 ${窗口}}`)
      case 'shell getprop ro.build.version.sdk':
        return Buffer.from(SDK)
      case 'shell am get-current-user':
        return Buffer.from('10')
      case `shell dumpsys package ${包名}`:
        return Buffer.from(权限)
      case `shell am force-stop ${包名}`:
        return Buffer.from('')
      case `shell am start -W -n ${主活动}`:
        窗口 = 主活动
        return Buffer.from('Status: ok\n')
    }
    throw new Error(`未预期命令：${命令}`)
  })
})

describe('Android 启动通知权限准备', () => {
  it.each(['USER_FIXED', 'POLICY_FIXED', 'SYSTEM_FIXED'])('接受固定拒绝 %s', (标记): void => {
    expect(通知权限状态稳定(包信息(10, false, `USER_SET|${标记}`), 10, 包名)).toBe(true)
  })

  it('只读取当前用户，拒绝一次和从未询问仍不稳定', (): void => {
    let 用户10 = 包信息(10, false, 'USER_SET').slice(包信息(10, false, 'USER_SET').indexOf('    User'))
    expect(通知权限状态稳定(`${包信息(0, true, '')}${用户10}`, 10, 包名)).toBe(false)
    expect(通知权限状态稳定(包信息(10, false, ''), 10, 包名)).toBe(false)
    expect(通知权限状态稳定(包信息(10, true, ''), 10, 包名)).toBe(true)
    expect(() => 通知权限状态稳定(包信息(0, true, ''), 10, 包名)).toThrow()
    expect(() => 通知权限状态稳定(包信息(10, true, '').repeat(2), 10, 包名)).toThrow()
    expect(() => 通知权限状态稳定('User 10: installed=true', 10, 包名)).toThrow()
  })

  it('只解析Packages中本包用户，忽略Queries重复用户', (): void => {
    let 真实格式 = `${包信息(0, false, 'USER_SET|USER_FIXED')}    User 10: installed=true\n      runtime permissions:\n        android.permission.POST_NOTIFICATIONS: granted=false, flags=[ ]\nQueries:\n    User 0:\n    User 10:\n`
    expect(通知权限状态稳定(真实格式, 0, 包名)).toBe(true)
    expect(通知权限状态稳定(真实格式, 10, 包名)).toBe(false)
    expect(() => 通知权限状态稳定(真实格式.replace('Packages:', 'QueriesOnly:'), 0, 包名)).toThrow()
    expect(() => 通知权限状态稳定(真实格式.replace(包名, 'com.other.app'), 0, 包名)).toThrow()
    expect(() =>
      通知权限状态稳定(`${包信息(0, true, '')}${包信息(0, true, '').replace('Packages:\n', '')}`, 0, 包名),
    ).toThrow()
  })

  it.each([权限活动, 'android/com.android.internal.app.ChooserActivity'])(
    '残留弹窗 %s 在force-stop前拒绝',
    async (活动): Promise<void> => {
      窗口 = 活动
      await expect(引擎().启动({ 允许通知询问: true })).rejects.toThrow('残留权限或分享弹窗')
      expect(命令们).toEqual(['shell dumpsys window'])
    },
  )

  it('未确定权限中止，保留原进程与活动栈', async (): Promise<void> => {
    权限 = 包信息(10, false, 'USER_SET')
    await expect(引擎().启动()).rejects.toThrow('allowNotificationPrompt')
    expect(命令们.some((命令) => 命令.includes('force-stop') || 命令.includes('am start'))).toBe(false)
  })

  it.each([false, true])('稳定状态启动，允许询问=%s', async (允许通知询问): Promise<void> => {
    await 引擎().启动({ 允许通知询问 })
    expect(命令们.indexOf(`shell dumpsys package ${包名}`)).toBeLessThan(命令们.indexOf(`shell am force-stop ${包名}`))
  })

  it('专门测试权限询问允许未确定状态，保持只读权限', async (): Promise<void> => {
    权限 = 包信息(10, false, '')
    await 引擎().启动({ 允许通知询问: true })
    expect(命令们).toContain(`shell am force-stop ${包名}`)
    expect(命令们.some((命令) => /grant|revoke|input tap/u.test(命令))).toBe(false)
  })

  it('Android 32跳过运行时通知权限查询', async (): Promise<void> => {
    SDK = '32'
    await 引擎().启动()
    expect(命令们).not.toContain(`shell dumpsys package ${包名}`)
  })

  it.each([{}, { allowNotificationPrompt: true }])('打开参数原样导出 %j', (参数): void => {
    expect(安卓打开模型.parse(参数)).toEqual({ observe: true, ...参数 })
    let 条目: 操作调用条目 = {
      id: 1,
      kind: 'call',
      notes: null,
      status: 'pending',
      start: '',
      tool: 'android_open',
      arguments: 参数,
    }
    expect(生成安卓调用代码(条目, false)?.语句们).toEqual([
      `await 当前状态.工具.Android.打开(${'allowNotificationPrompt' in 参数 ? '{ 允许通知询问: true }' : ''})`,
    ])
    let 错误参数: JSON对象 = { allowNotificationPrompt: 'true' }
    expect(安卓打开模型.safeParse(错误参数).success).toBe(false)
    expect(安卓打开模型.safeParse({ unrelated: true }).success).toBe(false)
  })
})
