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

let 接口路径 = '/api/demo/electron/dialog' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑.空逻辑().绑定(
  接口逻辑.构造([new JSON参数解析插件(z.object({}).strict(), {})], async (参数, 逻辑附加参数, 请求附加参数) => {
    // 在web环境中, 不存在'electron'依赖, 所以这里使用动态加载, 以免阻碍web环境运行
    let electron = await import('electron')
    let _log = 请求附加参数.log.extend(接口路径)
    new electron.Notification({ title: '提示', body: '你好世界' }).show()
    return new Right({})
  }),
)

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.never()
let 接口正确类型描述 = z.object({}).strip()

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述))
