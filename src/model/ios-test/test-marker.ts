/**
 * 前端开发服务器的代理凭 User-Agent 区分请求来源：iOS 测试包的请求走 iOS 网络中转，浏览器等其他请求直连后端。
 * iOS 测试包有两种请求来源，各有一个确定的特征：
 * - WebView 自己发的（页面、XHR、WebSocket、图片、iframe）：测试包构建时 项目测试包构建配置 给 WebView 的 User-Agent 追加 `MobileTestIos`，正式包不带。
 * - 开启了 CapacitorHttp 的 fetch 由原生 URLSession 发出，User-Agent 形如 `App/38 CFNetwork/3860.400.51 Darwin/25.3.0`，不含 WebView 标记；
 *   电脑浏览器（Chromium）和 Android 的请求没有 CFNetwork/Darwin 这一段。
 * `.proxyrc.cjs` 不能引用 TypeScript，使用 scripts/test/proxy-routing.cjs 里同一份规则；两处由单元测试保持一致。
 */
export let 苹果测试包标记 = 'MobileTestIos'

export let 苹果原生请求特征 = /\bCFNetwork\/[\d.]+ Darwin\/[\d.]+/u

export function 是苹果测试包请求(用户代理: string | string[] | undefined): boolean {
  let 值 = Array.isArray(用户代理) ? 用户代理.join(' ') : 用户代理
  return 值 !== undefined && (值.includes(苹果测试包标记) || 苹果原生请求特征.test(值))
}
