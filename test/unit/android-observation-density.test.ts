import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { 安卓测试引擎, 执行ADB } from '../../src/model/android-test'
import { 解析安卓屏幕密度 } from '../../src/model/android-test/density'
import { 创建安卓观察适配器 } from '../../src/test-tools/android-observation'

vi.mock('../../src/model/android-test/adb', () => ({ 执行ADB: vi.fn() }))

beforeEach((): void => {
  vi.resetAllMocks()
})

describe('Android 观察屏幕密度', () => {
  it('优先有效覆盖密度，未覆盖时使用物理密度', (): void => {
    expect(解析安卓屏幕密度('Physical density: 560\r\nOverride density: 640\r\n')).toBe(640)
    expect(解析安卓屏幕密度('Physical density: 560\n')).toBe(560)
  })

  it.each([
    '',
    'Override density: 640',
    'Physical density: 0',
    'Physical density: 560\nOverride density: bad',
    'Physical density: 560\nOverride density: 0',
    'Physical density: 560\nPhysical density: 560',
    'Physical density: 560\nOverride density: 640\nOverride density: 640',
    'Physical density: 560\nunknown',
    'Physical density: 1.5',
  ])('拒绝无法确定的实际密度：%s', (输出): void => {
    expect(() => 解析安卓屏幕密度(输出)).toThrow()
  })

  it('实际读取 wm density 计算 dp，保持物理像素操作坐标', async (): Promise<void> => {
    let 图片 = await sharp({ create: { width: 1440, height: 3200, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer()
    vi.mocked(执行ADB).mockImplementation(async (参数): Promise<Buffer> => {
      let 命令 = 参数.slice(2).join(' ')
      switch (命令) {
        case 'shell dumpsys window':
          return Buffer.from(
            'mCurrentFocus=Window{abc u0 com.example.mobiletest.localtest/com.example.mobiletest.MainActivity}',
          )
        case 'exec-out screencap -p':
          return 图片
        case 'shell wm density':
          return Buffer.from('Physical density: 560\nOverride density: 640\n')
      }
      throw new Error(`未预期命令：${命令}`)
    })
    let 信号 = new AbortController().signal
    let 引擎 = new 安卓测试引擎(
      'test-device',
      信号,
      async (): Promise<never> => {
        throw new Error('普通观察不使用 OCR')
      },
      {
        包名: 'com.example.mobiletest.localtest',
        启动组件: 'com.example.mobiletest.localtest/com.example.mobiletest.MainActivity',
        网页来源: 'https://localhost',
      },
    )
    let 适配器 = 创建安卓观察适配器(引擎)
    expect(await 适配器.截图(信号)).toMatchObject({ 宽: 1440, 高: 3200, 逻辑宽: 360, 逻辑高: 800, 手机: true })
    await 适配器.截图(信号)
    expect(
      vi.mocked(执行ADB).mock.calls.filter(([参数]) => 参数.slice(2).join(' ') === 'shell wm density'),
    ).toHaveLength(1)
    expect(vi.mocked(执行ADB)).toHaveBeenCalledWith(['-s', 'test-device', 'shell', 'wm', 'density'], 信号)
  })
})
