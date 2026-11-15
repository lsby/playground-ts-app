import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { 格式化需求测试错误 } from '../../scripts/test/requirement/format-error'
import { 安卓测试引擎, 执行ADB } from '../../src/model/android-test'
import { 需求测试安卓设备 } from '../../src/test-tools/android'
import type { 移动测试配置 } from '../../src/test-tools/mobile-config'

vi.mock('../../src/model/android-test/adb', () => ({ 执行ADB: vi.fn() }))
vi.mock('../../src/test-tools/mobile-config', () => ({
  读取移动测试配置: async (): Promise<移动测试配置> => ({
    Android: {
      包名: 'com.example.mobiletest.localtest',
      启动组件: 'com.example.mobiletest.localtest/com.example.mobiletest.MainActivity',
      网页来源: 'https://localhost',
      标准构建: {
        目录: 'test-outputs/android-test',
        应用文件: 'app.apk',
        信息文件: 'build.json',
        构建命令: 'build-test',
      },
      热重载构建: {
        目录: 'test-outputs/android-test-live',
        应用文件: 'app.apk',
        信息文件: 'build.json',
        构建命令: 'build-test-live',
      },
      获得OCR程序: async (): Promise<never> => {
        throw new Error('清理测试不使用 OCR')
      },
    },
  }),
}))
let { 释放锁 } = vi.hoisted(() => ({ 释放锁: vi.fn() }))
vi.mock('node:sqlite', () => ({ DatabaseSync: vi.fn().mockImplementation(() => ({ exec: vi.fn(), close: 释放锁 })) }))

let 根目录: string
let 硬件序号: string
let 摘要: string

beforeEach(async (): Promise<void> => {
  释放锁.mockClear()
  根目录 = await mkdtemp(join(tmpdir(), 'mobile-cleanup-unit-'))
  硬件序号 = randomUUID()
  let APK = Buffer.from('仅用于清理测试的合成安装包')
  摘要 = createHash('sha256').update(APK).digest('hex')
  let 构建目录 = join(根目录, 'test-outputs/android-test-live')
  await mkdir(构建目录, { recursive: true })
  await writeFile(join(构建目录, 'app.apk'), APK)
  await writeFile(
    join(构建目录, 'build.json'),
    JSON.stringify({ apiBaseUrl: 'http://127.0.0.1:36153', liveUrl: 'http://localhost:36154', sha256: 摘要 }),
  )
  vi.spyOn(安卓测试引擎.prototype, '启动').mockResolvedValue()
  vi.mocked(执行ADB).mockImplementation(async (参数): Promise<Buffer> => {
    let 命令 = 参数.slice(2).join(' ')
    if (命令 === 'get-state') return Buffer.from('device')
    if (命令 === 'shell getprop ro.serialno') return Buffer.from(硬件序号)
    if (命令.startsWith('shell pm path ')) return Buffer.from('package:/data/app/test/base.apk')
    if (命令 === 'shell sha256sum /data/app/test/base.apk') return Buffer.from(`${摘要}  /data/app/test/base.apk`)
    if (命令.startsWith('reverse --no-rebind ')) return Buffer.alloc(0)
    throw new Error(`未预期命令：${命令}`)
  })
})

afterEach(async (): Promise<void> => {
  vi.restoreAllMocks()
  await rm(根目录, { recursive: true, force: true })
})

describe('Android 测试会话清理', () => {
  it('取消后仍尝试全部清理，保留离线根因和端口，并释放设备锁', async (): Promise<void> => {
    let 取消 = new AbortController()
    let 设备 = new 需求测试安卓设备({
      项目根目录: 根目录,
      设备: 'test-device',
      获得后端地址: (): string => 'http://127.0.0.1:36153',
      热重载: { 前端地址: 'http://localhost:36154', HMR端口: 36155 },
      取消信号: 取消.signal,
    })
    await 设备.执行步骤(
      (): void => {},
      (错误): never => {
        throw 错误
      },
      () => 设备.打开(),
      '步骤',
      (): boolean => false,
    )
    let 关闭引擎 = vi.spyOn(安卓测试引擎.prototype, '关闭').mockRejectedValue(new Error('CDP 连接中断'))
    let 移除端口们: string[] = []
    vi.mocked(执行ADB).mockImplementation(async (参数, 信号): Promise<Buffer> => {
      expect(信号.aborted).toBe(false)
      let 端口 = 参数[4]
      if (参数.slice(2, 4).join(' ') !== 'reverse --remove' || 端口 === undefined)
        throw new Error('清理执行了非预期命令')
      移除端口们.push(端口)
      if (端口 === 'tcp:36153') throw new Error('device test-device not found')
      return Buffer.alloc(0)
    })
    取消.abort()
    let 关闭 = 设备.关闭()
    await expect(关闭).rejects.toThrow('关闭 Android 测试会话失败')
    expect(设备.关闭()).toBe(关闭)
    expect(关闭引擎).toHaveBeenCalledTimes(1)
    expect(移除端口们).toEqual(['tcp:36153', 'tcp:36154', 'tcp:36155'])
    await 关闭.catch((错误: unknown): void => {
      let 输出 = 格式化需求测试错误(
        new AggregateError([new AggregateError([错误], '关闭 MCP 测试会话失败')], '关闭测试开发套件失败'),
        join(根目录, 'scenario.ts'),
      ).文本
      expect(输出).toContain('CDP 连接中断')
      expect(输出).toContain('adb -s test-device reverse --remove tcp:36153')
      expect(输出).toContain('device test-device not found')
      expect(输出).not.toContain('[Array]')
    })
    expect(释放锁).toHaveBeenCalledTimes(1)
  })
})
