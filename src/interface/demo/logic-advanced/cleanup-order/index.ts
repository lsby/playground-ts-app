import {
  JSON参数解析插件,
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑JSON参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Right } from '@lsby/ts-fp-data'
import { z } from 'zod'

let 接口路径 = '/api/demo/logic-advanced/cleanup-order' as const
let 接口方法 = 'post' as const

let 上游逻辑 = 接口逻辑.构造(
  [new JSON参数解析插件(z.object({}), {})],
  async () => {
    let 执行记录 = ['上游执行']
    return new Right({ 执行记录 })
  },
  async (_参数, 逻辑附加参数) => {
    逻辑附加参数['执行记录'].push('上游清理')
  },
)

let 下游逻辑 = 接口逻辑.构造<[], { 执行记录: string[] }, never, Record<never, never>>(
  [],
  async (_参数, 逻辑附加参数) => {
    逻辑附加参数.执行记录.push('下游执行')
    return new Right({})
  },
  async (_参数, 逻辑附加参数) => {
    逻辑附加参数.执行记录.push('下游清理')
  },
)

// 每个逻辑的第三个参数都是清理函数。逻辑按绑定顺序执行，清理函数则按相反顺序执行。
// 本例特意共享执行记录的数组引用，让接口响应可以直观看到清理完成后的完整顺序。
let 接口逻辑实现 = 接口逻辑.空逻辑().绑定(上游逻辑).绑定(下游逻辑)

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.never()
let 接口正确类型描述 = z.object({ 执行记录: z.array(z.string()) })

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述))
