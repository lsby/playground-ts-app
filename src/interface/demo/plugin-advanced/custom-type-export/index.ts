import {
  JSON参数解析插件,
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑JSON参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Either, Right } from '@lsby/ts-fp-data'
import { z } from 'zod'
import { 菜单项类型 } from './types'

let 接口路径 = '/api/demo/plugin-advanced/custom-type-export' as const
let 接口方法 = 'post' as const

// 使用 z.lazy 构造递归 Zod 校验结构来匹配递归的 菜单项类型
export let 菜单项验证Zod: z.ZodType<菜单项类型> = z.lazy(() =>
  z.object({ title: z.string(), path: z.string(), children: z.array(菜单项验证Zod).optional() }).strict(),
)

let 接口逻辑实现 = 接口逻辑.构造(
  [new JSON参数解析插件(z.object({ menu: 菜单项验证Zod }).strict(), {})],
  async (参数, _逻辑附加参数, 请求附加参数): Promise<Either<never, { processedMenu: 菜单项类型 }>> => {
    let 日志 = 请求附加参数.log
    let 菜单数据 = 参数.json.menu

    await 日志.info(`[自定义类型导出] 成功校验递归菜单: ${菜单数据.title}`)
    return new Right({ processedMenu: 菜单数据 })
  },
)

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口返回器 = new 常用接口返回器(z.never(), z.object({ processedMenu: 菜单项验证Zod }).strip())

export default new 接口(接口路径, 接口方法, 接口逻辑实现, 接口返回器)
