import { describe, expect, it } from 'vitest'

import { 地址一致, 比较地址变化, 规范地址 } from '../../src/model/web-locate/page-url'

describe('页面地址规范化', () => {
  it('打包版 capacitor 地址 pathname 为空时和带斜杠的写法等价', () => {
    expect(规范地址('capacitor://localhost#x')).toBe('/#x')
    expect(规范地址('capacitor://localhost/#x')).toBe('/#x')
    expect(地址一致('capacitor://localhost#x', '/#x')).toBe(true)
    expect(地址一致('capacitor://localhost#x', 'http://192.168.1.2:36154/#x')).toBe(true)
    expect(地址一致('capacitor://localhost', '/')).toBe(true)
    expect(地址一致('https://localhost/#x', '#x')).toBe(true)
  })

  it('hash 里的查询参数（含随机 flow 编号）整体丢弃，只比路由名', () => {
    expect(规范地址('http://localhost:36154/#protocol?flow=7c9e6679-7425-40de-944b-e07fc1f90ae7&step=2')).toBe(
      '/#protocol',
    )
    expect(地址一致('capacitor://localhost#protocol?flow=aaa&step=1', '/#protocol?flow=bbb&step=1')).toBe(true)
    expect(地址一致('/#protocol?flow=aaa', '/#home')).toBe(false)
  })

  it('路径或 hash 里的随机编号段换成 :id，普通词不动', () => {
    expect(规范地址('/gift/7c9e6679-7425-40de-944b-e07fc1f90ae7')).toBe('/gift/:id')
    expect(规范地址('/#/order/1731542400123')).toBe('/#/order/:id')
    expect(规范地址('/#/r/0123456789abcdef0123')).toBe('/#/r/:id')
    // 保守：纯字母的长词、短数字、短十六进制不算随机编号
    expect(规范地址('/#/abcdefabcdefabcdefabcdef')).toBe('/#/abcdefabcdefabcdefabcdef')
    expect(规范地址('/#/page/12345')).toBe('/#/page/12345')
    expect(规范地址('/#/page/deadbeef')).toBe('/#/page/deadbeef')
    expect(规范地址('/terms/')).toBe('/terms/')
  })

  it('只有随机编号变化不算地址变化', () => {
    expect(比较地址变化('/#protocol?flow=a&step=1', '/#protocol?flow=b&step=2')).toBeUndefined()
    expect(比较地址变化('/#home', '/#protocol?flow=b')).toEqual({ 前: '/#home', 后: '/#protocol' })
  })
})
