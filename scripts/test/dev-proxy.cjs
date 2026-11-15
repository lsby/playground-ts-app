let { createProxyMiddleware } = require('http-proxy-middleware')
let { 是苹果测试包请求 } = require('./proxy-routing.cjs')

let 端口 = process.env.APP_PORT
if (端口 === undefined || /^\d+$/.test(端口) === false || Number(端口) < 1 || Number(端口) > 65535)
  throw new Error('APP_PORT 必须是有效的端口号')

// iOS 热重载测试时，dev-suite 设置 PROXY_BACKEND_PORT（iOS 网络中转端口）。
// 只有 iOS 测试包 WebView 发出的请求（User-Agent 带测试包标记）走中转，用来模拟断网；浏览器等其他请求始终直连后端。
let 中转端口 = process.env.PROXY_BACKEND_PORT
if (中转端口 !== undefined && (/^\d+$/.test(中转端口) === false || Number(中转端口) < 1 || Number(中转端口) > 65535))
  throw new Error('PROXY_BACKEND_PORT 必须是有效的端口号')
let 后端目标 = `http://127.0.0.1:${端口}`
let 中转目标 = 中转端口 === undefined ? undefined : `http://127.0.0.1:${中转端口}`
let 走中转 = (请求) => 中转目标 !== undefined && 是苹果测试包请求(请求.headers['user-agent'])

let 上次日志 = 0

function 创建测试开发代理(路由前缀们) {
  return function (app) {
    app.use(
      createProxyMiddleware({
        target: 后端目标,
        changeOrigin: true,
        ws: true,
        router: (请求) => (走中转(请求) ? 中转目标 : 后端目标),
        // 经网络中转时，目标连不上就直接断开客户端连接（和真实断网一致，App 的 fetch 会抛网络异常，不返回 504），并写一行原因。
        ...(中转目标 === undefined
          ? {}
          : {
              on: {
                error: (错误, 请求, 响应) => {
                  if (走中转(请求) === false) {
                    if (响应.writeHead !== undefined && 响应.headersSent !== true) {
                      响应.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
                      响应.end(`测试后端无法连接：${错误.code ?? 错误.message}`)
                    } else 响应.destroy?.()
                    return
                  }
                  // ECONNRESET / socket hang up 是中转在 offline 或 hang 状态下主动断开，属于预期的模拟断网，不写日志
                  let 预期断开 = 错误.code === 'ECONNRESET' || /socket hang up/u.test(String(错误.message))
                  let 现在 = Date.now()
                  if (预期断开 === false && 现在 - 上次日志 > 3000) {
                    上次日志 = 现在
                    console.error(
                      `[前端代理] iOS 网络中转未就绪（${中转目标} 连接失败：${错误.code ?? 错误.message}），iOS 测试包的请求被断开：${请求.method} ${请求.url}`,
                    )
                  }
                  let 连接 =
                    响应.destroy === undefined || 响应.socket !== undefined ? (响应.socket ?? 请求.socket) : 响应
                  连接.destroy()
                },
              },
            }),
        pathFilter: (路径) => 路由前缀们.some((前缀) => 路径 === 前缀 || 路径.startsWith(`${前缀}/`)),
      }),
    )
  }
}
module.exports = { 创建测试开发代理 }
