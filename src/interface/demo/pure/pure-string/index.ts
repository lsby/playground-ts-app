import {
  Query参数解析插件,
  接口,
  接口逻辑,
  自定义接口返回器,
  计算接口逻辑Query参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Either, Left, Right } from '@lsby/ts-fp-data'
import { z } from 'zod'

let 接口路径 = '/api/demo/pure/pure-string' as const
let 接口方法 = 'get' as const

let 接口逻辑实现 = 接口逻辑.构造(
  [new Query参数解析插件(z.object({ name: z.string() }).strict())],
  async (参数, _逻辑附加参数, _请求附加参数): Promise<Either<'名称不能为空', { data: string }>> => {
    let 姓名 = 参数.query.name
    if (姓名 === '') {
      return new Left('名称不能为空' as const)
    }
    return new Right({ data: `你好 ${姓名}！此响应由自定义文本接口返回器生成。` })
  },
)

type _接口逻辑Query参数 = 计算接口逻辑Query参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['名称不能为空'])
let 接口正确类型描述 = z.object({ data: z.string() }).strip()

let 自定义返回处理器 = new 自定义接口返回器(
  接口错误类型描述,
  接口正确类型描述,
  z.string(),
  z.string(),
  (请求, 响应, 数据): void => {
    if (数据.isLeft() === true) {
      响应.status(400).send(数据.assertLeft().getLeft())
      return
    }
    响应.setHeader('Content-Type', 'text/plain; charset=utf-8')
    响应.send(数据.assertRight().getRight().data)
    return
  },
)

export default new 接口(接口路径, 接口方法, 接口逻辑实现, 自定义返回处理器)
