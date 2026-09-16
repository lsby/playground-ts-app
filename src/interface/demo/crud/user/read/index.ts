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
import { 环境变量 } from '../../../../../global/env'
import { kysely插件 } from '../../../../../global/plugin'
import { 检查管理员登录 } from '../../../../../interface-logic/check/check-login-jwt-admin'

let 接口路径 = '/api/demo/crud/user/read' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(检查管理员登录)
  .绑定(
    接口逻辑.构造(
      [
        new JSON参数解析插件(
          z.object({
            page: z.number(),
            size: z.number(),
            orderBy: z
              .array(z.object({ field: z.enum(['id', 'name']), direction: z.enum(['asc', 'desc']) }))
              .optional(),
            filter: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
          }),
          {},
        ),
        kysely插件,
      ],
      async (参数) => {
        // 样例模式 返回假数据
        if (环境变量.SAMPLE_MODE === true) {
          return new Right({
            data: [
              { id: 'preview-user-1', name: '用户一' },
              { id: 'preview-user-2', name: '用户二' },
              { id: 'preview-user-3', name: '管理员' },
            ],
            total: 3,
          })
        }

        let { page, size, orderBy, filter } = 参数.json
        if (page <= 0) throw new Error('当前页从1开始')
        let 查询 = 参数.kysely.获得句柄().selectFrom('user')
        if (filter !== undefined) {
          if (filter.id !== undefined) 查询 = 查询.where('id', 'like', `%${filter.id}%`)
          if (filter.name !== undefined) 查询 = 查询.where('name', 'like', `%${filter.name}%`)
        }

        let 总数结果 = await 查询.select((表达式) => 表达式.fn.countAll<number>().as('total')).executeTakeFirstOrThrow()
        let 数据查询 = 查询
          .select(['id', 'name'])
          .limit(size)
          .offset((page - 1) * size)
        if (orderBy !== undefined) {
          for (let 排序项 of orderBy) 数据查询 = 数据查询.orderBy(排序项.field, 排序项.direction)
        }

        return new Right({ data: await 数据查询.execute(), total: Number(总数结果.total) })
      },
    ),
  )

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['未登录', '非管理员'])
let 接口正确类型描述 = z.object({ data: z.object({ id: z.string(), name: z.string() }).array(), total: z.number() })

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述), {
  支持纯前端模式: true,
})
