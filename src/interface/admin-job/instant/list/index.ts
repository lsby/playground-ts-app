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
import { 即时任务管理器 } from '../../../../global/global'
import { 检查管理员登录 } from '../../../../interface-logic/check/check-login-jwt-admin'

let 接口路径 = '/api/admin-job/instant/list' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(检查管理员登录)
  .绑定(
    接口逻辑.构造([new JSON参数解析插件(z.object({}), {})], async (参数, 逻辑附加参数, 请求附加参数) => {
      let _log = 请求附加参数.log.extend(接口路径)
      let 任务管理器 = 即时任务管理器

      let 任务列表 = 任务管理器
        .获得所有任务列表()
        .map((任务) => ({
          id: 任务.获得id(),
          名称: 任务.获得任务名称(),
          状态: 任务.获得当前状态(),
          优先级: 任务.获得即时任务优先级(),
          创建时间: 任务.获得创建时间().getTime(),
          开始时间: 任务.获得开始时间()?.getTime() ?? null,
          结束时间: 任务.获得结束时间()?.getTime() ?? null,
          执行时长: 任务.获得执行时长(),
          重试次数: 任务.获得当前重试次数(),
          错误信息: 任务.获得错误信息()?.message ?? null,
          输出结果: 任务.获得输出结果(),
        }))

      return new Right({ 任务列表 })
    }),
  )

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['未登录', '非管理员'])
let 接口正确类型描述 = z.object({
  任务列表: z.array(
    z.object({
      id: z.string(),
      名称: z.string(),
      状态: z.string(),
      优先级: z.number(),
      创建时间: z.number(),
      开始时间: z.number().nullable(),
      结束时间: z.number().nullable(),
      执行时长: z.number().nullable(),
      重试次数: z.number(),
      错误信息: z.string().nullable(),
      输出结果: z.unknown(),
    }),
  ),
})

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述))
