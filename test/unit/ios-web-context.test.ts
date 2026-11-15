import { describe, expect, it } from 'vitest'

import { 筛选网页上下文, 选择网页上下文 } from '../../src/model/ios-test/web-context'

describe('iOS 网页上下文筛选', () => {
  it('同 origin 下的任何页面都算，原生和其他来源不算，url 为 null 也不报错', () => {
    let 上下文们 = [
      { id: 'NATIVE_APP' },
      { id: 'WEBVIEW_1', url: 'capacitor://localhost/terms/' },
      { id: 'WEBVIEW_2', url: 'https://example.com/' },
      { id: 'WEBVIEW_3', url: null },
    ]
    expect(筛选网页上下文(上下文们, 'capacitor://localhost')).toEqual(['WEBVIEW_1'])
  })

  it('换文档后优先选和缓存不同的新上下文', () => {
    expect(选择网页上下文([], 'WEBVIEW_1')).toBeUndefined()
    expect(选择网页上下文(['WEBVIEW_2'], 'WEBVIEW_1')).toBe('WEBVIEW_2')
    expect(选择网页上下文(['WEBVIEW_1', 'WEBVIEW_2'], 'WEBVIEW_1')).toBe('WEBVIEW_2')
    expect(选择网页上下文(['WEBVIEW_1', 'WEBVIEW_2'], 'WEBVIEW_2')).toBe('WEBVIEW_1')
    expect(选择网页上下文(['WEBVIEW_1', 'WEBVIEW_2'], undefined)).toBe('WEBVIEW_2')
  })
})
