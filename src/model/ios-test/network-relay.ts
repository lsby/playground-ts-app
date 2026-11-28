import net from 'node:net'

export type 苹果网络状态 = 'online' | 'offline' | 'hang' | 'maintenance' | 'crash'

/** 测试包连接的中转端口：后端端口加 1000（超出范围时减 1000），构建和运行用同一规则。 */
export function 计算苹果中转端口(后端端口: number): number {
  let 端口 = 后端端口 + 1000
  return 端口 > 65535 ? 后端端口 - 1000 : 端口
}

/**
 * 本机 TCP 中转：模拟器里的测试包连中转端口，中转再转发到测试后端。
 * 用来模拟「飞行模式」和「有信号但网很差」，HTTP 和 WebSocket 都经过它。
 * maintenance 模拟服务器升级时 nginx 的维护开关：不连后端，OPTIONS 预检回 204，其他请求（含 WebSocket 升级）回 503 JSON，
 * 并带 CORS 头（跨域的 App 才读得到正文）。真实 nginx 也必须同样处理预检和 CORS 头，否则 App 只会看到网络错误。
 * crash 模拟主服务崩溃或重启中、nginx 连不上上游：同样不连后端，OPTIONS 回 204，其他请求回 502 JSON（错误码「服务暂时不可用」）。
 */
export class 苹果网络中转 {
  private 状态: 苹果网络状态 = 'online'
  private readonly 连接们 = new Set<net.Socket>()
  private readonly 服务 = net.createServer((客户端): void => this.处理连接(客户端))

  private 上次连接失败日志 = 0

  public constructor(
    private readonly 监听端口: number,
    private readonly 后端端口: number,
    /** 中转自己的诊断信息（连不上后端等）；3 秒内同类信息只写一次。 */
    private readonly 日志: (消息: string) => void = (): void => {},
  ) {}

  public 获得监听端口(): number {
    return this.监听端口
  }

  public async 启动(): Promise<void> {
    await new Promise<void>((resolve, reject): void => {
      this.服务.once('error', (错误: NodeJS.ErrnoException): void => {
        reject(
          错误.code === 'EADDRINUSE'
            ? new Error(`iOS 网络中转端口 ${String(this.监听端口)} 已被占用`, { cause: 错误 })
            : 错误,
        )
      })
      this.服务.listen(this.监听端口, '127.0.0.1', (): void => {
        this.服务.removeAllListeners('error')
        this.服务.on('error', (错误): void => this.日志(`iOS 网络中转出错：${错误.message}`))
        resolve()
      })
    })
  }

  public 获得状态(): 苹果网络状态 {
    return this.状态
  }

  /** iOS 会话结束或数据库重置时调用：恢复透传并断开现存连接，但中转继续监听，浏览器之外的接口请求不受影响。 */
  public 恢复在线(): void {
    this.设置状态('online')
  }

  /** 切换状态时断开所有现存连接，App 里正在进行的请求会立即失败。 */
  public 设置状态(状态: 苹果网络状态): void {
    this.状态 = 状态
    this.断开全部()
  }

  public async 关闭(): Promise<void> {
    this.状态 = 'online'
    this.断开全部()
    await new Promise<void>((resolve): void => {
      this.服务.close((): void => resolve())
    })
  }

  private 断开全部(): void {
    for (let 连接 of this.连接们) 连接.destroy()
    this.连接们.clear()
  }

  private 处理连接(客户端: net.Socket): void {
    客户端.on('error', (): void => {})
    if (this.状态 === 'offline') {
      客户端.destroy()
      return
    }
    this.连接们.add(客户端)
    客户端.on('close', (): void => {
      this.连接们.delete(客户端)
    })
    // 无响应：接住连接但永远不回复。
    if (this.状态 === 'hang') return
    if (this.状态 === 'maintenance' || this.状态 === 'crash') {
      this.回复维护(客户端)
      return
    }
    let 后端 = net.connect(this.后端端口, '127.0.0.1')
    this.连接们.add(后端)
    后端.on('error', (错误): void => {
      let 现在 = Date.now()
      if (现在 - this.上次连接失败日志 > 3000) {
        this.上次连接失败日志 = 现在
        this.日志(
          `iOS 网络中转无法连接测试后端 127.0.0.1:${String(this.后端端口)}（${(错误 as NodeJS.ErrnoException).code ?? 错误.message}），请求被断开`,
        )
      }
      客户端.destroy()
    })
    后端.on('close', (): void => {
      this.连接们.delete(后端)
      客户端.destroy()
    })
    客户端.on('close', (): void => {
      后端.destroy()
    })
    客户端.pipe(后端)
    后端.pipe(客户端)
  }

  /** 读到第一段数据（请求头）后按方法回复维护（503）或崩溃（502）响应，写完断开。 */
  private 回复维护(客户端: net.Socket): void {
    客户端.once('data', (数据: Buffer): void => {
      let 请求头 = 数据.toString('utf8').split('\r\n\r\n')[0] ?? ''
      let 行们 = 请求头.split('\r\n')
      let 方法 = (行们[0] ?? '').split(' ')[0]?.toUpperCase() ?? ''
      let 读头 = (名称: string): string | undefined => {
        for (let 行 of 行们.slice(1)) {
          let 位置 = 行.indexOf(':')
          if (位置 > 0 && 行.slice(0, 位置).trim().toLowerCase() === 名称) return 行.slice(位置 + 1).trim()
        }
        return undefined
      }
      let 来源 = 读头('origin') ?? '*'
      let 响应 = ''
      if (方法 === 'OPTIONS') {
        响应 = [
          'HTTP/1.1 204 No Content',
          `Access-Control-Allow-Origin: ${来源}`,
          'Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS',
          `Access-Control-Allow-Headers: ${读头('access-control-request-headers') ?? '*'}`,
          'Access-Control-Max-Age: 0',
          'Connection: close',
          '',
          '',
        ].join('\r\n')
      } else if (this.状态 === 'crash') {
        let 正文 = JSON.stringify({ status: 'unexpected', data: { 错误码: '服务暂时不可用' } })
        响应 = [
          'HTTP/1.1 502 Bad Gateway',
          'Content-Type: application/json; charset=utf-8',
          `Access-Control-Allow-Origin: ${来源}`,
          'Cache-Control: no-store',
          `Content-Length: ${String(Buffer.byteLength(正文, 'utf8'))}`,
          'Connection: close',
          '',
          正文,
        ].join('\r\n')
      } else {
        let 正文 = JSON.stringify({ status: 'unexpected', data: { 错误码: '服务正在升级', 预计恢复分钟: 10 } })
        响应 = [
          'HTTP/1.1 503 Service Unavailable',
          'Content-Type: application/json; charset=utf-8',
          `Access-Control-Allow-Origin: ${来源}`,
          'Retry-After: 60',
          'Cache-Control: no-store',
          `Content-Length: ${String(Buffer.byteLength(正文, 'utf8'))}`,
          'Connection: close',
          '',
          正文,
        ].join('\r\n')
      }
      客户端.end(响应)
    })
  }
}
