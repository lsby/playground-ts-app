import { chromium, type Browser, type Page } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { 定位脚本, 落点验证脚本 } from '../../src/model/ios-test/web-script'
import { 屏幕转网页坐标, 生成定位候选 } from '../../src/model/web-locate/candidates'
import { 执行页面脚本, 探测页面落点, 读取页面视口 } from '../../src/model/web-locate/playwright'
import { 整理落点结果 } from '../../src/model/web-locate/probe'
import { 清理脚本, 落点脚本 } from '../../src/model/web-locate/scripts'

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

  it('iOS 的验证脚本与查询逻辑：同一份候选在页面里验证到同一个元素', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    let 原始 = await 执行页面脚本(页面, 落点脚本, [30, 220])
    try {
      let 结果 = await 整理落点结果(原始, async (候选们) => {
        let 序号 = (await 执行页面脚本(页面, 落点验证脚本, [候选们.map(({ 种类, 值 }) => ({ 种类, 值 }))])) as number
        return 候选们[序号]
      })
      expect(结果).toMatchObject({ 状态: '已识别', 定位: { 种类: '文字', 值: '首页' } })
      // 同文字两个按钮：iOS 的文字查询也不唯一
      await 执行页面脚本(页面, 清理脚本)
      let 重复 = await 执行页面脚本(页面, 落点脚本, [50, 90])
      let 重复结果 = await 整理落点结果(重复, async (候选们) => {
        let 序号 = (await 执行页面脚本(页面, 落点验证脚本, [候选们.map(({ 种类, 值 }) => ({ 种类, 值 }))])) as number
        return 候选们[序号]
      })
      expect(重复结果).toMatchObject({ 状态: '无定位' })
      expect(生成定位候选({ 标签: 'button', aria标签: '收下礼物' })).toHaveLength(1)
    } finally {
      await 执行页面脚本(页面, 清理脚本)
    }
  })
})

describe('iOS 点击前的可点击检查（定位脚本，真实浏览器）', () => {
  let 页面HTML2 = `<style>
    body { margin: 0 }
    button { position: absolute; left: 10px; width: 100px; height: 40px }
    #ok { top: 10px } #covered { top: 70px } #disabled { top: 130px } #aria { top: 190px } #hidden { top: 250px; display: none }
    #cover { position: absolute; left: 0; top: 60px; width: 200px; height: 60px; background: rgba(0,0,0,.1) }
    x-card::part(x) { display: block }
  </style>
  <button id="ok"><span id="inner">好</span></button>
  <button id="covered">被盖住</button><div id="cover"></div>
  <button id="disabled" disabled>禁用</button>
  <button id="aria" aria-disabled="true">假禁用</button>
  <button id="hidden">隐藏</button>
  <x-card></x-card>
  <script>
    customElements.define('x-card', class extends HTMLElement {
      connectedCallback() {
        this.attachShadow({ mode: 'open' }).innerHTML = '<button id="deep" style="position:absolute;left:10px;top:310px;width:100px;height:40px">卡片按钮</button>'
      }
    })
  </script>`

  async function 定位(种类: string, 值: string): Promise<Record<string, unknown>> {
    let 页面2 = await 浏览器?.newPage({ viewport: { width: 300, height: 520 } })
    if (页面2 === undefined) throw new Error('缺少浏览器')
    try {
      await 页面2.setContent(页面HTML2)
      return (await 执行页面脚本(页面2, 定位脚本, [种类, 值, true])) as Record<string, unknown>
    } finally {
      await 页面2.close()
    }
  }

  it('正常按钮可点击，并报告元素尺寸', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    expect(await 定位('css', '#ok')).toMatchObject({
      数量: 1,
      可见数量: 1,
      可点击: true,
      禁用: false,
      元素宽: 100,
      元素高: 40,
    })
  })

  it('中心点被别的元素盖住时不可点击', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    expect(await 定位('css', '#covered')).toMatchObject({ 可点击: false, 禁用: false })
  })

  it('disabled 和 aria-disabled 都不可点击', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    expect(await 定位('css', '#disabled')).toMatchObject({ 可点击: false, 禁用: true })
    expect(await 定位('css', '#aria')).toMatchObject({ 可点击: false, 禁用: true })
  })

  it('不可见的元素数量为 1 但可见数量为 0，不可点击', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    expect(await 定位('css', '#hidden')).toMatchObject({ 数量: 1, 可见数量: 0, 可点击: false })
  })

  it('穿透 Shadow DOM 的目标命中自己才算可点击', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    expect(await 定位('css', '#deep')).toMatchObject({ 数量: 1, 可点击: true })
  })

  it('按钮里文字元素也能点（命中后代算自己）', async (ctx) => {
    if (浏览器 === undefined) return ctx.skip()
    expect(await 定位('text', '好')).toMatchObject({ 数量: 1, 可点击: true })
  })
})
