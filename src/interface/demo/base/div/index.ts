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

let 接口路径 = '/api/demo/base/div' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑.空逻辑().绑定(
  接口逻辑.构造(
    [new JSON参数解析插件(z.object({ a: z.number(), b: z.number() }).strict(), {})],
    async (参数, 逻辑附加参数, 请求附加参数) => {
      let _log = 请求附加参数.log.extend(接口路径)

      if (参数.json.b === 0) {
        // 当发生错误时，不仅可以返回错误标识，还可以返回具体的错误详情
        return new Left({ 错误: '计算失败' as const, 详情: `传入的除数为0` })
      }

      return new Right({ res: 参数.json.a / 参数.json.b })
    },
  ),
)

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['计算失败'])
let 接口正确类型描述 = z.object({ res: z.number() }).strip()

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述))

export let 加法示例接口 = 接口逻辑实现.获得最后接口()
