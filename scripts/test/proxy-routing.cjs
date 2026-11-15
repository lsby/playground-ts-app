// 前端开发服务器代理的分流规则，和 src/model/ios-test/test-marker.ts 保持一致（单元测试校验）。
let 苹果测试包标记 = 'MobileTestIos'
let 苹果原生请求特征 = /\bCFNetwork\/[\d.]+ Darwin\/[\d.]+/u

function 是苹果测试包请求(用户代理) {
  let 值 = Array.isArray(用户代理) ? 用户代理.join(' ') : 用户代理
  return 值 !== undefined && (值.includes(苹果测试包标记) || 苹果原生请求特征.test(值))
}

module.exports = { 苹果测试包标记, 苹果原生请求特征, 是苹果测试包请求 }
