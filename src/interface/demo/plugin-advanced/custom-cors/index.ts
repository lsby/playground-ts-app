import { JSON参数解析插件, 常用接口返回器, 接口, 接口逻辑 } from '@lsby/net-core'
import { Either, Right } from '@lsby/ts-fp-data'
import { z } from 'zod'

let 接口路径 = '/api/demo/plugin-advanced/custom-cors' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑.构造(
  [new JSON参数解析插件(z.object({ name: z.string() }).strict(), {})],
  async (参数, _逻辑附加参数, _请求附加参数): Promise<Either<never, { message: string }>> => {
    let 姓名 = 参数.json.name
    return new Right({ message: `你好 ${姓名}！该接口成功定制了独立的跨域（CORS）头部响应。` })
  },
)

let 接口返回器 = new 常用接口返回器(z.never(), z.object({ message: z.string() }).strip(), {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
})

export default new 接口(接口路径, 接口方法, 接口逻辑实现, 接口返回器)
