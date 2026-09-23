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
import { CompiledQuery } from 'kysely'
import { z } from 'zod'
import { kysely插件 } from '../../../global/plugin'
import { 检查管理员登录 } from '../../../interface-logic/check/check-login-jwt-admin'

let 接口路径 = '/api/admin-sqlite/get-table-schema' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(检查管理员登录)
  .绑定(
    接口逻辑.构造(
      [
        new JSON参数解析插件(
          z.object({ tableName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, '表名格式无效') }).strict(),
          {},
        ),
        kysely插件,
      ],
      async (参数, 逻辑附加参数, 请求附加参数) => {
        let _log = 请求附加参数.log.extend(接口路径)

        let kysely = 参数.kysely.获得句柄()

        let 结果 = await kysely.executeQuery(CompiledQuery.raw(`PRAGMA table_info("${参数.json.tableName}");`, []))

        let rowSchema = z
          .object({
            cid: z.number(),
            name: z.string(),
            type: z.string(),
            notnull: z.number(),
            pk: z.number(),
            dflt_value: z.union([z.string(), z.null()]),
          })
          .strict()

        let columns = 结果.rows.map((row) => {
          let parsed = rowSchema.parse(row)
          return {
            name: parsed.name,
            type: parsed.type,
            notnull: parsed.notnull,
            pk: parsed.pk,
            dflt_value: parsed.dflt_value,
          }
        })

        return new Right({ columns: 接口正确类型描述.shape.columns.parse(columns) })
      },
    ),
  )

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['未登录', '非管理员'])
let 接口正确类型描述 = z
  .object({
    columns: z.array(
      z
        .object({
          name: z.string(),
          type: z.string(),
          notnull: z.number(),
          pk: z.number(),
          dflt_value: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strip()

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述))
