import {
  JSON参数解析插件,
  WebSocket插件,
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑JSON参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
  集线器监听器宿主,
} from '@lsby/net-core'
import { Right } from '@lsby/ts-fp-data'
import { z } from 'zod'

let 接口路径 = '/api/demo/ws/ws-test' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑.空逻辑().绑定(
  接口逻辑.构造(
    [
      new JSON参数解析插件(z.object({}).strict(), {}),
      new WebSocket插件(z.object({ data: z.string() }).strict(), z.object({ message: z.string() }).strict()),
    ],
    async (参数, 逻辑附加参数, 请求附加参数) => {
      let _log = 请求附加参数.log.extend(接口路径)

      let 数据 = ['你', '好', '世', '界']

      // 可以监听前端通过ws发来的信息
      // 这个监听, 在不关闭ws句柄的情况下会存在
      // 监听器无需手动释放, 而是基于FinalizationRegistry机制, 但需要注意:
      // - 如果需要在接口返回之后依然有效, 需要在接口生命周期外存在宿主
      // - 即使只想要在接口声明周期中有效, 也需要宿主, 因为V8是通过可达性分析的, 如果不用变量接收, 可能会被过早回收
      // 本例中, 我只想要监听器在接口函数返回前有效, 所以宿主在接口生命周期中定义
      let 监听器宿主 = new 集线器监听器宿主()
      await 参数.ws操作?.监听ws信息(async (消息) => {
        await _log.info('收到前端消息', { 消息 })
      }, 监听器宿主)

      for (let 当前数据 of 数据) {
        await 参数.ws操作?.发送ws信息({ data: 当前数据 }).catch(() => {})
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      // 也可以手动释放监听宿主, 避免依赖FinalizationRegistry的不确定性
      监听器宿主.解绑()

      return new Right({})
    },
    async (参数) => {
      await 参数.ws操作?.关闭ws连接()
    },
  ),
)

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.never()
let 接口正确类型描述 = z.object({}).strip()

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述))
