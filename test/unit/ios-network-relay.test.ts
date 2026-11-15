import { createRequire } from 'node:module'
import net from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'

import { 苹果网络中转 } from '../../src/model/ios-test/network-relay'
import { 是苹果测试包请求, 苹果原生请求特征, 苹果测试包标记 } from '../../src/model/ios-test/test-marker'

let 清理们: (() => Promise<void>)[] = []
afterEach(async () => {
  for (let 清理 of 清理们.splice(0)) await 清理()
})

async function 空闲端口(): Promise<number> {
  let 服务 = net.createServer()
  await new Promise<void>((resolve) => 服务.listen(0, '127.0.0.1', resolve))
  let 端口 = (服务.address() as net.AddressInfo).port
  await new Promise<void>((resolve) => 服务.close(() => resolve()))
  return 端口
}

async function 启动回声后端(): Promise<number> {
  let 服务 = net.createServer((连接) => 连接.on('data', (数据) => 连接.write(数据)))
  await new Promise<void>((resolve) => 服务.listen(0, '127.0.0.1', resolve))
  清理们.push(async () => {
    ;(服务 as net.Server & { closeAllConnections?: () => void }).closeAllConnections?.()
    await new Promise<void>((resolve) => 服务.close(() => resolve()))
  })
  return (服务.address() as net.AddressInfo).port
}

function 往返(端口: number, 内容: string): Promise<string> {
  return new Promise((resolve) => {
    let 连接 = net.connect(端口, '127.0.0.1')
    let 收到 = ''
    连接.on('connect', () => 连接.write(内容))
    连接.on('data', (数据) => {
      收到 += 数据.toString()
      连接.destroy()
    })
    连接.on('close', () => resolve(收到))
    连接.on('error', () => {})
  })
}

describe('iOS 网络中转', () => {
  it('恢复在线只断开连接和重置状态，监听继续', async () => {
    let 后端 = await 启动回声后端()
    let 端口 = await 空闲端口()
    let 中转 = new 苹果网络中转(端口, 后端)
    await 中转.启动()
    清理们.push(() => 中转.关闭())
    expect(await 往返(端口, 'a')).toBe('a')
    中转.设置状态('offline')
    expect(await 往返(端口, 'b')).toBe('')
    中转.恢复在线()
    expect(中转.获得状态()).toBe('online')
    expect(await 往返(端口, 'c')).toBe('c')
  })

  it('连不上测试后端时写一行原因，3 秒内不重复', async () => {
    let 后端 = await 空闲端口()
    let 端口 = await 空闲端口()
    let 日志们: string[] = []
    let 中转 = new 苹果网络中转(端口, 后端, (消息) => 日志们.push(消息))
    await 中转.启动()
    清理们.push(() => 中转.关闭())
    await 往返(端口, 'x')
    await 往返(端口, 'y')
    expect(日志们).toHaveLength(1)
    expect(日志们[0]).toContain(`127.0.0.1:${String(后端)}`)
    expect(日志们[0]).toContain('请求被断开')
  })

  it('端口被占用时报明确错误', async () => {
    let 端口 = await 空闲端口()
    let 第一个 = new 苹果网络中转(端口, 1)
    await 第一个.启动()
    清理们.push(() => 第一个.关闭())
    await expect(new 苹果网络中转(端口, 1).启动()).rejects.toThrow(`iOS 网络中转端口 ${String(端口)} 已被占用`)
  })
})

describe('前端代理按来源分流', () => {
  let 分流 = createRequire(import.meta.url)('../../scripts/test/proxy-routing.cjs') as {
    苹果测试包标记: string
    苹果原生请求特征: RegExp
    是苹果测试包请求: (用户代理: string | string[] | undefined) => boolean
  }
  let 用户代理们 = [
    `Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ${苹果测试包标记}`,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    '',
    undefined,
    ['curl/8', 苹果测试包标记],
    'App/38 CFNetwork/3860.400.51 Darwin/25.3.0',
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
    'okhttp/4.12.0',
  ]

  it('只有带测试包标记的请求走中转，cjs 与 ts 两份规则一致', () => {
    expect(分流.苹果测试包标记).toBe(苹果测试包标记)
    expect(分流.苹果原生请求特征.source).toBe(苹果原生请求特征.source)
    expect(用户代理们.map((值) => 是苹果测试包请求(值))).toEqual([
      true,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
    ])
    for (let 值 of 用户代理们) expect(分流.是苹果测试包请求(值)).toBe(是苹果测试包请求(值))
  })
})
