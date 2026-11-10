import { createConnection, createServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

function 关闭接口地址(实例标识: string): string {
  let 名称 = `playground-test-${实例标识}`
  return process.platform === 'win32' ? `\\\\.\\pipe\\${名称}` : path.join(tmpdir(), 名称)
}

export async function 开放关闭接口(
  实例标识: string,
  请求关闭: () => void,
): Promise<(关闭成功: boolean) => Promise<void>> {
  let 连接们 = new Set<Socket>()
  let 服务 = createServer((连接) => {
    连接们.add(连接)
    连接.on('error', (): void => {
      连接.destroy()
    })
    连接.once('close', (): void => {
      连接们.delete(连接)
    })
    请求关闭()
  })
  await new Promise<void>((完成, 失败) => {
    服务.once('error', 失败)
    服务.listen(关闭接口地址(实例标识), () => {
      服务.off('error', 失败)
      完成()
    })
  })
  return async (关闭成功): Promise<void> => {
    let 关闭 = new Promise<void>((完成, 失败) => {
      服务.close((错误) => {
        if (错误 === undefined) 完成()
        else 失败(错误)
      })
    })
    for (let 连接 of 连接们) 连接.end(关闭成功 ? 'STOPPED\n' : 'FAILED\n')
    await 关闭
  }
}

export async function 请求关闭开发套件(实例标识: string): Promise<void> {
  await new Promise<void>((完成, 失败) => {
    let 连接 = createConnection(关闭接口地址(实例标识))
    let 响应 = ''
    连接.setEncoding('utf8')
    连接.setTimeout(45_000, (): void => {
      连接.destroy(new Error('等待测试开发套件关闭超时'))
    })
    连接.on('data', (内容: string): void => {
      响应 += 内容
    })
    连接.once('error', 失败)
    连接.once('close', (): void => {
      if (响应 === 'STOPPED\n') 完成()
      else 失败(new Error('测试开发套件未确认关闭成功，请查看其终端输出'))
    })
  })
}
