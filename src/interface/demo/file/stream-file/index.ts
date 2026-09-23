import {
  Query参数解析插件,
  接口,
  接口逻辑,
  文件流式下载返回器,
  计算接口逻辑Query参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Right } from '@lsby/ts-fp-data'
import { createReadStream } from 'fs'
import path from 'path'
import { z } from 'zod'

let 接口路径 = '/api/demo/file/stream-file' as const
let 接口方法 = 'get' as const

let 接口逻辑实现 = 接口逻辑.构造(
  [new Query参数解析插件(z.object({}).strict())],
  async (_参数, _逻辑附加参数, _请求附加参数) => {
    let fileStream = createReadStream(path.resolve(import.meta.dirname, 'data.txt'))
    return new Right({ data: fileStream, filename: 'data.txt', mimeType: 'application/octet-stream' })
  },
)

type _接口逻辑Query参数 = 计算接口逻辑Query参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 文件流式下载返回器(z.never()))
