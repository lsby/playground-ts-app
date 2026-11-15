import { chromium, type Browser, type Page } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { 屏幕转网页坐标 } from '../../src/model/web-locate/candidates'
import { 探测页面落点, 读取页面视口 } from '../../src/model/web-locate/playwright'

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

let 浏览器: Browser | undefined
let 页面: Page

let 页面HTML = `<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin: 0; font: 16px sans-serif }
  button, .card { position: absolute; width: 120px; height: 40px }
  #gift { left: 10px; top: 10px }
  button.d1 { left: 10px; top: 70px }
  button.d2 { left: 10px; top: 130px }
  nav { position: absolute; left: 10px; top: 200px }
  nav button { position: static; display: block }
  canvas { position: absolute; left: 10px; top: 300px; width: 200px; height: 100px }
  .plain { position: absolute; left: 10px; top: 420px; width: 100px; height: 30px; background: #eee }
  .big { position: absolute; left: 0; top: 0; width: 600px; height: 700px }
</style>
<button id="gift" aria-label="收下礼物">收下</button>
<button class="same d1">确定</button>
<button class="same d2">确定</button>
<nav aria-label="主导航"><button class="tab">首页</button><button class="tab">我的</button></nav>
<canvas id="stage"></canvas>
<div class="plain">空白</div>
<x-shell></x-shell>
<script>
  class Shell extends HTMLElement {
    connectedCallback() {
      let 根 = this.attachShadow({ mode: 'open' })
      根.innerHTML = '<style>.wrap{position:absolute;left:250px;top:10px;width:150px;height:60px}</style><div class="wrap"><x-inner></x-inner></div>'
    }
  }
  class Inner extends HTMLElement {
    connectedCallback() {
      let 根 = this.attachShadow({ mode: 'open' })
      根.innerHTML = '<style>button{width:140px;height:50px}</style><button aria-label="深处按钮">深处</button>'
    }
  }
  customElements.define('x-shell', Shell)
  customElements.define('x-inner', Inner)
</script>`

beforeAll(async () => {
  浏览器 = await 启动浏览器()
  if (浏览器 === undefined) return
  页面 = await 浏览器.newPage({ viewport: { width: 480, height: 520 } })
  await 页面.setContent(页面HTML)
})

afterAll(async () => {
  await 浏览器?.close()
})

describe('落点识别（真实浏览器）', () => {
  it.skipIf(process.env['SKIP_REAL_BROWSER'] === '1')('aria-label 按钮：生成并验证 aria-label 选择器', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    let 结果 = await 探测页面落点(页面, { x: 50, y: 30 })
    expect(结果).toMatchObject({ 状态: '已识别', 定位: { 种类: '选择器', 值: 'button[aria-label="收下礼物"]' } })
  })

  it('同样文字又没有 id 的两个按钮没有唯一定位，报无定位', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    let 结果 = await 探测页面落点(页面, { x: 50, y: 90 })
    expect(结果).toMatchObject({ 状态: '无定位', 原因: '没有能唯一指向它的定位' })
  })

  it('祖先 aria-label 加文字组合能唯一指向导航里的按钮', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    let 结果 = await 探测页面落点(页面, { x: 30, y: 220 })
    // 文字「首页」整页唯一，优先用文字
    expect(结果).toMatchObject({ 状态: '已识别', 定位: { 种类: '文字', 值: '首页' } })
  })

  it('穿透两层 Shadow DOM 找到深处的按钮', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    let 结果 = await 探测页面落点(页面, { x: 300, y: 30 })
    expect(结果).toMatchObject({ 状态: '已识别', 定位: { 种类: '选择器', 值: 'button[aria-label="深处按钮"]' } })
  })

  it('Canvas 和空白处没有可点击元素：无定位并说明命中的是什么', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    expect(await 探测页面落点(页面, { x: 100, y: 350 })).toEqual({
      状态: '无定位',
      原因: '落点没有可点击的元素',
      命中: '<canvas>',
    })
    expect(await 探测页面落点(页面, { x: 50, y: 430 })).toMatchObject({ 状态: '无定位', 命中: '<div class="plain">' })
  })

  it('探测结束后清掉页面里的临时引用', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    await 探测页面落点(页面, { x: 50, y: 30 })
    expect(await 页面.evaluate('window.__ntProbeTarget === null || window.__ntProbeTarget === undefined')).toBe(true)
  })

  it('视口读取与坐标换算：浏览器坐标原样使用', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    let 视口 = await 读取页面视口(页面)
    expect(视口).toEqual({ 宽: 480, 高: 520 })
    expect(屏幕转网页坐标({ x: 50, y: 30 }, { 左: 0, 上: 0, 宽: 480, 高: 520 }, 视口)).toEqual({ x: 50, y: 30 })
  })
})
