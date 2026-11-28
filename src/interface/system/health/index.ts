import { 常用接口返回器, 接口, 接口逻辑, 计算接口逻辑正确结果, 计算接口逻辑错误结果 } from '@lsby/net-core'
import { Right } from '@lsby/ts-fp-data'
import { z } from 'zod'
import { kysely插件 } from '../../../global/plugin'

let 接口路径 = '/api/system/health' as const
let 接口方法 = 'get' as const
let 接口逻辑实现 = 接口逻辑.构造([kysely插件], async (参数) => {
  await 参数.kysely.获得句柄().selectFrom('system_config').select('id').limit(1).execute()
  return new Right({ status: 'ok' as const, database: 'ok' as const })
})

type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

export default new 接口(
  接口路径,
  接口方法,
  接口逻辑实现,
  new 常用接口返回器(z.never(), z.object({ status: z.literal('ok'), database: z.literal('ok') }).strict()),
)
