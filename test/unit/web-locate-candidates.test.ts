import { describe, expect, it } from 'vitest'

import { 定位脚本, 落点验证脚本 } from '../../src/model/ios-test/web-script'
import {
  屏幕转网页坐标,
  描述元素,
  描述命中元素,
  比例是否一致,
  生成定位候选,
  type 元素描述,
} from '../../src/model/web-locate/candidates'
import { 地址一致, 比较地址变化, 规范地址 } from '../../src/model/web-locate/page-url'
import { 整理落点结果 } from '../../src/model/web-locate/probe'
import { 清理脚本, 落点脚本, 读取视口脚本 } from '../../src/model/web-locate/scripts'

function 描述(覆盖: Partial<元素描述>): 元素描述 {
  return { 标签: 'button', ...覆盖 }
}

describe('落点元素转定位候选', () => {
  it('aria-label 优先，其次文字，再到稳定属性，最后是祖先组合', () => {
    let 候选们 = 生成定位候选(
      描述({
        aria标签: '收下礼物',
        文字: '收下',
        id: 'claim',
        数据属性们: [{ 名: 'data-action', 值: 'claim' }],
        祖先: { 标签: 'nav', aria标签: '主导航' },
      }),
    )
    expect(候选们.map(({ 种类, 值 }) => [种类, 值])).toEqual([
      ['选择器', 'button[aria-label="收下礼物"]'],
      ['文字', '收下'],
      ['选择器', 'button#claim'],
      ['选择器', 'button[data-action="claim"]'],
      ['选择器', 'nav[aria-label="主导航"] button[aria-label="收下礼物"]'],
      ['选择器', 'nav[aria-label="主导航"] button:has-text("收下")'],
      ['选择器', 'nav[aria-label="主导航"] button'],
    ])
  })

  it('祖先 aria-label 加文字的组合只用空格和末尾 :has-text，三端都能解析', () => {
    let 候选们 = 生成定位候选(描述({ 文字: '首页', 祖先: { 标签: 'nav', aria标签: '主导航' } }))
    expect(候选们[1]?.值).toBe('nav[aria-label="主导航"] button:has-text("首页")')
    for (let { 值 } of 候选们) expect(值).not.toMatch(/[+~,]|:nth|:is\(|>>/u)
  })

  it('文字超过 20 字、含引号或反斜杠时不生成文字候选', () => {
    expect(生成定位候选(描述({ 文字: '一二三四五六七八九十一二三四五六七八九十一' }))).toEqual([])
    expect(生成定位候选(描述({ 文字: '说"好"' }))).toEqual([])
    expect(生成定位候选(描述({ 文字: '二十个字以内' }))).toEqual([{ 种类: '文字', 值: '二十个字以内', 来源: '文字' }])
  })

  it('属性值里的引号和反斜杠被转义；不稳定的 id 和框架散列属性被忽略', () => {
    let 候选们 = 生成定位候选(
      描述({
        aria标签: 'a\\b',
        id: 'item-20260101',
        数据属性们: [
          { 名: 'data-v-7ba5bd90', 值: '' },
          { 名: 'data-nt-probe', 值: 'x' },
          { 名: 'data-id', 值: '12345678' },
        ],
      }),
    )
    expect(候选们.map(({ 值 }) => 值)).toEqual([])
    expect(生成定位候选(描述({ aria标签: '关闭' }))[0]?.值).toBe('button[aria-label="关闭"]')
    expect(生成定位候选(描述({ 标签: 'DIV', aria标签: 'x y' }))[0]?.值).toBe('div[aria-label="x y"]')
  })

  it('没有任何可用信息时没有候选', () => {
    expect(生成定位候选(描述({}))).toEqual([])
  })

  it('描述元素给出按钮「名称」，没有名称时给标签', () => {
    expect(描述元素(描述({ 文字: '收下礼物' }))).toBe('按钮「收下礼物」')
    expect(描述元素(描述({ 标签: 'a', aria标签: '返回' }))).toBe('链接「返回」')
    expect(描述元素(描述({ 标签: 'div', 角色: 'tab', 文字: '首页' }))).toBe('标签页「首页」')
    expect(描述元素(描述({ 标签: 'div' }))).toBe('元素<div>')
    expect(描述命中元素({ 标签: 'CANVAS', 类名: 'stage  big' })).toBe('<canvas class="stage big">')
    expect(描述命中元素({ 标签: 'div' })).toBe('<div>')
  })
})

describe('操作坐标换算成页面坐标', () => {
  it('iOS：点换算到 WebView 的 CSS 视口', () => {
    // WebView 在屏幕上从 (0, 54) 开始，402×820 点；页面视口 402×820
    expect(屏幕转网页坐标({ x: 200, y: 354 }, { 左: 0, 上: 54, 宽: 402, 高: 820 }, { 宽: 402, 高: 820 })).toEqual({
      x: 200,
      y: 300,
    })
    // 页面缩放：视口比控件小一半
    expect(屏幕转网页坐标({ x: 200, y: 354 }, { 左: 0, 上: 54, 宽: 402, 高: 820 }, { 宽: 201, 高: 410 })).toEqual({
      x: 100,
      y: 150,
    })
  })

  it('Android：物理像素除以像素密度（范围与视口之比）', () => {
    // 1080×2200 的 WebView，页面视口 411.4×838.1（密度 2.625）
    let 结果 = 屏幕转网页坐标({ x: 540, y: 1100 }, { 左: 0, 上: 0, 宽: 1080, 高: 2200 }, { 宽: 411.43, 高: 838.1 })
    expect(结果?.x).toBeCloseTo(205.7, 1)
    expect(结果?.y).toBeCloseTo(419.05, 1)
    // WebView 上方有 100 像素的状态栏
    let 带偏移 = 屏幕转网页坐标({ x: 540, y: 1200 }, { 左: 0, 上: 100, 宽: 1080, 高: 2200 }, { 宽: 411.43, 高: 838.1 })
    expect(带偏移?.y).toBeCloseTo(419.05, 1)
  })

  it('浏览器：范围与视口相同，坐标不变', () => {
    expect(屏幕转网页坐标({ x: 12, y: 34 }, { 左: 0, 上: 0, 宽: 800, 高: 600 }, { 宽: 800, 高: 600 })).toEqual({
      x: 12,
      y: 34,
    })
  })

  it('落在 WebView 之外（原生界面）返回 undefined', () => {
    expect(屏幕转网页坐标({ x: 10, y: 20 }, { 左: 0, 上: 54, 宽: 402, 高: 820 }, { 宽: 402, 高: 820 })).toBeUndefined()
    expect(屏幕转网页坐标({ x: 10, y: 900 }, { 左: 0, 上: 54, 宽: 402, 高: 820 }, { 宽: 402, 高: 820 })).toBeUndefined()
  })

  it('范围与视口比例相差太大视为取错了范围', () => {
    expect(比例是否一致({ 左: 0, 上: 0, 宽: 1080, 高: 2200 }, { 宽: 411.43, 高: 838.1 })).toBe(true)
    expect(比例是否一致({ 左: 0, 上: 0, 宽: 1080, 高: 1000 }, { 宽: 411.43, 高: 838.1 })).toBe(false)
  })
})

describe('页面地址规则', () => {
  it('只比较 pathname 加 hash，忽略 origin 和查询串', () => {
    expect(规范地址('http://192.168.1.2:3000/#/home')).toBe('/#/home')
    expect(规范地址('capacitor://localhost/#/home?x=1')).toBe('/#/home')
    expect(规范地址('/page/index.html#/gift')).toBe('/page/index.html#/gift')
    expect(规范地址('#/home')).toBe('/#/home')
    expect(地址一致('http://192.168.1.2:3000/#/home', 'capacitor://localhost/#/home')).toBe(true)
    expect(地址一致('capacitor://localhost/#/home', '/#/gift')).toBe(false)
  })

  it('变化时返回规范前后地址，没变化或读不到时返回 undefined', () => {
    expect(比较地址变化('http://a/#/home', 'http://a/#/gift')).toEqual({ 前: '/#/home', 后: '/#/gift' })
    expect(比较地址变化('http://a/#/home', 'http://b/#/home')).toBeUndefined()
    expect(比较地址变化(undefined, 'http://b/#/home')).toBeUndefined()
  })
})

describe('落点识别结果整理', () => {
  let 目标 = { 标签: 'button', 文字: '收下礼物', 数据属性们: [] }

  it('第一个通过验证的候选胜出', async (): Promise<void> => {
    let 结果 = await 整理落点结果({ 命中: { 标签: 'span' }, 目标 }, async (候选们) => 候选们[0])
    expect(结果).toEqual({ 状态: '已识别', 定位: { 种类: '文字', 值: '收下礼物' }, 说明: '按钮「收下礼物」' })
  })

  it('没有候选通过验证时说明命中的元素', async (): Promise<void> => {
    let 结果 = await 整理落点结果({ 命中: { 标签: 'span' }, 目标 }, async () => undefined)
    expect(结果).toMatchObject({ 状态: '无定位', 原因: '没有能唯一指向它的定位' })
  })

  it('落点没有可点击元素（Canvas、空白）时返回命中元素的标签和类名', async (): Promise<void> => {
    let 结果 = await 整理落点结果({ 命中: { 标签: 'canvas', 类名: 'stage' }, 目标: null }, async () => undefined)
    expect(结果).toEqual({ 状态: '无定位', 原因: '落点没有可点击的元素', 命中: '<canvas class="stage">' })
  })

  it('落点没有页面元素时是页面之外', async (): Promise<void> => {
    let 结果 = await 整理落点结果({ 命中: null, 目标: null }, async () => undefined)
    expect(结果).toMatchObject({ 状态: '无定位', 命中: '页面之外' })
  })
})

describe('页面脚本语法', () => {
  it('落点脚本、验证脚本、清理脚本、视口脚本、定位脚本都是合法的函数体', () => {
    for (let 脚本 of [落点脚本, 落点验证脚本, 清理脚本, 读取视口脚本, 定位脚本])
      expect(() => new Function(脚本)).not.toThrow()
  })
})

describe('跨文档地址比较', () => {
  it('跳到独立页面 /terms/ 和回到 /#login 都算变化', () => {
    expect(比较地址变化('capacitor://localhost/#login', 'capacitor://localhost/terms/')).toEqual({
      前: '/#login',
      后: '/terms/',
    })
    expect(比较地址变化('capacitor://localhost/terms/', 'capacitor://localhost/#login')).toEqual({
      前: '/terms/',
      后: '/#login',
    })
    expect(地址一致('http://10.0.0.2:1234/terms/', '/terms/')).toBe(true)
  })
})
