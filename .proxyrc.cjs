let { createProxyMiddleware } = require('http-proxy-middleware')

let 端口 = process.env.APP_PORT
if (端口 === undefined || /^\d+$/.test(端口) === false || Number(端口) < 1 || Number(端口) > 65535)
  throw new Error('APP_PORT 必须是有效的端口号')

module.exports = function (app) {
  app.use(
    createProxyMiddleware({
      target: `http://127.0.0.1:${端口}`,
      changeOrigin: true,
      ws: true,
      pathFilter: (路径) => ['/api', '/ws', '/public'].some((前缀) => 路径 === 前缀 || 路径.startsWith(`${前缀}/`)),
    }),
  )
}
