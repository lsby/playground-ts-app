import net from 'net'
import { globalLog } from '../global/global'

/**
 * 检查指定端口是否可用
 */
export async function 检查端口可用(端口: number): Promise<boolean> {
  return new Promise((resolve) => {
    let 服务器 = net.createServer()
    服务器.listen(端口, '127.0.0.1', () => {
      服务器.close()
      resolve(true)
    })
    服务器.on('error', () => {
      resolve(false)
    })
  })
}

/**
 * 获取一个随机的可用端口
 * 尝试10次，如果都失败则退出应用
 */
export async function 获取随机可用端口(): Promise<number> {
  for (let 尝试次数 = 0; 尝试次数 < 10; 尝试次数++) {
    let 端口 = Math.floor(Math.random() * (65535 - 1024)) + 1024
    if (await 检查端口可用(端口)) {
      return 端口
    }
  }

  let log = globalLog.extend('electron')
  await log.error('尝试10次后仍未找到可用端口，退出应用')

  throw new Error('未找到可用端口')
}

/**
 * 检查指定端口是否已被监听（即可连接）
 */
export async function 检查端口已监听(端口: number): Promise<boolean> {
  return new Promise((resolve) => {
    let 套接字 = net.createConnection({ port: 端口, host: '127.0.0.1' })
    套接字.once('connect', () => {
      套接字.destroy()
      resolve(true)
    })
    套接字.once('error', () => {
      套接字.destroy()
      resolve(false)
    })
  })
}

/**
 * 等待指定端口就绪（已被监听）
 *
 * @param 端口 目标端口
 * @param 最大尝试次数 最大重试次数（默认 60 次）
 * @param 间隔毫秒 每次尝试间隔毫秒（默认 500ms，总限时约 30 秒）
 */
export async function 等待端口就绪(端口: number, 最大尝试次数 = 60, 间隔毫秒 = 500): Promise<boolean> {
  let log = globalLog.extend('electron')
  for (let 尝试次数 = 1; 尝试次数 <= 最大尝试次数; 尝试次数++) {
    let 已监听 = await 检查端口已监听(端口)
    if (已监听 === true) {
      await log.info(`前端开发服务已就绪 (127.0.0.1:${端口})`)
      return true
    }
    if (尝试次数 === 1 || 尝试次数 % 6 === 0) {
      await log.info(`等待前端开发服务就绪 (127.0.0.1:${端口})，第 ${尝试次数}/${最大尝试次数} 次尝试...`)
    }
    await new Promise((resolve) => setTimeout(resolve, 间隔毫秒))
  }

  await log.error(`等待前端开发服务就绪超时 (127.0.0.1:${端口})，已尝试 ${最大尝试次数} 次`)
  return false
}
