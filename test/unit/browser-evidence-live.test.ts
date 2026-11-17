import { chromium, type Browser, type Page } from '@playwright/test'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { 浏览器测试引擎 } from '../../src/model/browser-test'
import { 标注截图, 获得视口内标注位置 } from '../../src/model/browser-test/screenshot'
import { 浏览器步骤取证作用域 } from '../../src/model/browser-test/step-evidence'
import type { 浏览器步骤证据 } from '../../src/model/browser-test/types'

let 浏览器: Browser | undefined
let 页面: Page
let 页面HTML = `<style>
body { margin: 0; background: white }
#clip { position: absolute; left: 40px; top: 40px; width: 120px; height: 60px; overflow: hidden }
x-holder { display: block; position: relative; width: 240px; height: 100px }
iframe { position: absolute; left: 300px; top: 40px; width: 200px; height: 120px; border: 0 }
#moving { position: absolute; top: 250px; width: 60px; height: 60px; background: #00ff00; animation: drift 10s linear infinite alternate }
@keyframes drift { from { transform: translateX(0) } to { transform: translateX(500px) } }
</style>
<div id="clip"><x-holder></x-holder></div><div id="moving"></div>
<iframe srcdoc="<style>body{margin:0}button{position:absolute;left:20px;top:20px;width:80px;height:40px}</style><button>Frame button</button>"></iframe>
<script>
customElements.define('x-holder', class extends HTMLElement {
  connectedCallback() { this.attachShadow({mode:'open'}).innerHTML = '<button id="clipped" style="position:absolute;left:80px;top:10px;width:160px;height:40px;background:#ff8800;border:0">Clipped button</button>' }
});
</script>`

beforeAll(async (): Promise<void> => {
  浏览器 = await chromium.launch({ headless: true })
  页面 = await 浏览器.newPage({ viewport: { width: 800, height: 600 } })
})

afterAll(async (): Promise<void> => {
  await 浏览器?.close()
})

async function 准备页面(): Promise<void> {
  await 页面.setContent(页面HTML)
  await 页面.locator('#clipped').waitFor({ state: 'visible' })
  await 页面.frameLocator('iframe').getByRole('button').waitFor({ state: 'visible' })
}

describe('实际浏览器截图与标注', () => {
  it('尚未挂载的目标立即返回无标记，不等待元素出现', async (): Promise<void> => {
    await 页面.setContent('<p>目标尚未挂载</p>')
    let 目标 = 页面.locator('#later')
    expect(await 获得视口内标注位置(目标)).toBeUndefined()
    expect(await 目标.count()).toBe(0)
  })

  it('目标缺失时先保存实际画面，延迟挂载后业务点击仍使用原超时等待', async (): Promise<void> => {
    await 页面.setContent('<p>目标尚未挂载</p>')
    let 作用域 = new 浏览器步骤取证作用域()
    let 引擎 = new 浏览器测试引擎({ 页面, 模式: '自动' }, { 作用域, 会话名称: 'delayed-target' })
    let 图片们: 浏览器步骤证据[] = []
    let 错误们: unknown[] = []
    let 通知操作前截图 = (): void => {
      throw new Error('截图通知尚未登记')
    }
    let 操作前截图 = new Promise<void>((完成): void => {
      通知操作前截图 = 完成
    })
    let 点击任务 = 作用域.运行(
      () => ({
        提交: async (证据): Promise<void> => {
          图片们.push(证据)
          if (证据.阶段 === '操作前') 通知操作前截图()
        },
        记录错误: (错误): void => {
          错误们.push(错误)
        },
      }),
      async (): Promise<void> => {
        await 引擎.点击(引擎.定位('#later'), { timeout: 2000 })
      },
    )
    await Promise.race([
      操作前截图,
      点击任务.then((): never => {
        throw new Error('目标挂载前点击任务提前结束')
      }),
    ])
    expect(await 页面.locator('#later').count()).toBe(0)
    expect(图片们.some((证据) => 证据.阶段 === '操作前')).toBe(true)
    await 页面.evaluate((): void => {
      let 按钮 = document.createElement('button')
      按钮.id = 'later'
      按钮.textContent = '稍后挂载的按钮'
      按钮.onclick = (): void => {
        按钮.textContent = '点击成功'
      }
      document.body.append(按钮)
    })
    await 点击任务
    expect(await 页面.locator('#later').textContent()).toBe('点击成功')
    expect(错误们).toEqual([])
    let 证据 = 图片们[0]
    if (证据 === undefined) throw new Error('缺少目标挂载前实际画面')
    expect(await sharp(证据.图片).metadata()).toMatchObject({ width: 800, height: 600 })
  })

  it('多个目标明确报歧义，不选择第一个或静默丢弃标记', async (): Promise<void> => {
    await 页面.setContent('<button>相同目标</button><button>相同目标</button>')
    await expect(获得视口内标注位置(页面.getByRole('button', { name: '相同目标' }))).rejects.toThrow(/2|多个|匹配/u)
  })

  it('Shadow DOM外的滚动祖先裁剪也参与可见中心计算', async (): Promise<void> => {
    await 准备页面()
    expect(await 获得视口内标注位置(页面.locator('#clipped'))).toEqual({ x: 140, y: 70 })
    await 页面.locator('#clip').evaluate((元素): void => {
      元素.scrollLeft = 30
    })
    expect(await 获得视口内标注位置(页面.locator('#clipped'))).toEqual({ x: 125, y: 70 })
  })

  it('iframe目标坐标仍映射到主页面CSS像素', async (): Promise<void> => {
    await 准备页面()
    let 位置 = await 获得视口内标注位置(页面.frameLocator('iframe').getByRole('button'))
    expect(位置).toEqual({ x: 360, y: 80 })
  })

  it('标注在Node绘制，保留原始画面尺寸、内容及清晰点击标记', async (): Promise<void> => {
    await 准备页面()
    let 原图 = await 页面.screenshot({ scale: 'css', animations: 'allow' })
    let 页面执行 = vi.spyOn(页面, 'evaluate').mockRejectedValue(new Error('截图标注不应调用浏览器Canvas'))
    let 标注图: Buffer
    try {
      标注图 = await 标注截图(原图, { x: 140, y: 70 })
    } finally {
      页面执行.mockRestore()
    }
    let 图片 = await sharp(标注图).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let 原始 = await sharp(原图).ensureAlpha().raw().toBuffer()
    expect(图片.info).toMatchObject({ width: 800, height: 600, channels: 4 })
    let 中心 = (70 * 800 + 140) * 4
    expect(图片.data[中心]).toBeGreaterThan(150)
    expect(图片.data[中心 + 1]).toBeLessThan(100)
    expect(图片.data[中心 + 2]).toBeLessThan(100)
    let 内容点 = (70 * 800 + 125) * 4
    expect(原始[内容点]).toBe(255)
    expect(原始[内容点 + 1]).toBe(136)
    expect(图片.data.subarray(0, 4)).toEqual(原始.subarray(0, 4))
    expect(原图.equals(标注图)).toBe(false)
  })

  it('步骤证据保存实际内容，动画仍按原时间播放', async (): Promise<void> => {
    await 准备页面()
    let 作用域 = new 浏览器步骤取证作用域()
    let 引擎 = new 浏览器测试引擎({ 页面, 模式: '自动' }, { 作用域, 会话名称: 'live-evidence' })
    let 图片们: 浏览器步骤证据[] = []
    let 错误们: unknown[] = []
    let 前 = await 页面.locator('#moving').evaluate((元素) => {
      let 动画 = 元素.getAnimations()[0]
      if (动画 === undefined) throw new Error('缺少实际动画')
      return { 时间: Number(动画.currentTime), 播放: 动画.playState }
    })
    let 开始 = performance.now()
    await 作用域.运行(
      () => ({
        提交: async (证据): Promise<void> => {
          图片们.push(证据)
        },
        记录错误: (错误): void => {
          错误们.push(错误)
        },
      }),
      async (): Promise<void> => {
        await 引擎.验证可见(引擎.定位('#clipped'))
      },
    )
    let 后 = await 页面.locator('#moving').evaluate((元素) => {
      let 动画 = 元素.getAnimations()[0]
      if (动画 === undefined) throw new Error('动画被移除')
      return { 时间: Number(动画.currentTime), 播放: 动画.playState }
    })
    expect(错误们).toEqual([])
    expect(图片们.length).toBeGreaterThan(0)
    expect(前.播放).toBe('running')
    expect(后.播放).toBe('running')
    expect(后.时间).toBeGreaterThanOrEqual(前.时间)
    expect(后.时间 - 前.时间).toBeLessThan(performance.now() - 开始 + 150)
    let 证据 = 图片们[0]
    if (证据 === undefined) throw new Error('没有保存步骤截图')
    expect(await sharp(证据.图片).metadata()).toMatchObject({ width: 800, height: 600 })
  })

  it('实际截图错误仍被记录，步骤的业务结果继续保留', async (): Promise<void> => {
    await 准备页面()
    let 作用域 = new 浏览器步骤取证作用域()
    let 引擎 = new 浏览器测试引擎({ 页面, 模式: '自动' }, { 作用域, 会话名称: 'live-failure' })
    let 错误们: unknown[] = []
    let 截图 = vi.spyOn(页面, 'screenshot').mockRejectedValueOnce(new Error('有意验证截图失败报告'))
    let 结果: string
    try {
      结果 = await 作用域.运行(
        () => ({
          提交: async (): Promise<void> => {},
          记录错误: (错误): void => {
            错误们.push(错误)
          },
        }),
        async (): Promise<string> => {
          await 引擎.验证可见(引擎.定位('#clipped'))
          return '业务检查通过'
        },
      )
    } finally {
      截图.mockRestore()
    }
    expect(结果).toBe('业务检查通过')
    expect(错误们).toHaveLength(1)
    expect(String(错误们[0])).toContain('有意验证截图失败报告')
  })
})
