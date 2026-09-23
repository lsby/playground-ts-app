import {
  JSON参数解析插件,
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑JSON参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Left, Right } from '@lsby/ts-fp-data'
import { z } from 'zod'
import { 检查登录 } from '../../../../interface-logic/check/check-login-jwt'
import { 加法示例接口 } from '../add'

let 接口路径 = '/api/demo/base/sub' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(检查登录)
  .绑定(
    接口逻辑.构造(
      [new JSON参数解析插件(z.object({ a: z.number(), b: z.number() }).strict(), {})],
      async (参数, 逻辑附加参数, 请求附加参数) => {
        let log = 请求附加参数.log.extend(接口路径)
        let 调用结果 = await 加法示例接口.调用({ json: { a: 参数.json.a, b: 参数.json.b * -1 } }, 逻辑附加参数, {
          ...请求附加参数,
          log,
        })
        if (调用结果.isLeft()) return new Left(调用结果.assertLeft().getLeft())
        return new Right(调用结果.assertRight().getRight())
      },
    ),
  )

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['未登录'])
let 接口正确类型描述 = z.object({ res: z.number() }).strip()

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述))
