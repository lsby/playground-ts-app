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
import { 系统配置ID } from '../../../global/const'
import { jwt插件, kysely插件 } from '../../../global/plugin'
import { 检查管理员登录 } from '../../../interface-logic/check/check-login-jwt-admin'

let 接口路径 = '/api/system/update-system-config' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(new 检查管理员登录([jwt插件.解析器, kysely插件], () => ({ 表名: 'user', id字段: 'id', 标识字段: 'is_admin' })))
  .绑定(
    接口逻辑.构造(
      [
        new JSON参数解析插件(
          z.object({ enable_register: z.boolean().optional(), enable_get_interface_type: z.boolean().optional() }),
          {},
        ),
        kysely插件,
      ],
      async (参数, 逻辑附加参数, 请求附加参数) => {
        let _log = 请求附加参数.log.extend(接口路径)

        let 更新数据: { enable_register?: number; enable_get_interface_type?: number } = {}
        if (参数.json.enable_register !== undefined) {
          更新数据.enable_register = 参数.json.enable_register === true ? 1 : 0
        }
        if (参数.json.enable_get_interface_type !== undefined) {
          更新数据.enable_get_interface_type = 参数.json.enable_get_interface_type === true ? 1 : 0
        }

        let 更新结果 = await 参数.kysely
          .获得句柄()
          .updateTable('system_config')
          .set(更新数据)
          .where('id', '=', 系统配置ID)
          .executeTakeFirstOrThrow()
        if (更新结果.numUpdatedRows !== 1n) throw new Error('系统配置更新失败：配置不存在')
        return new Right({})
      },
    ),
  )

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['未登录', '非管理员', '输入参数错误'])
let 接口正确类型描述 = z.object({})

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述), {
  支持纯前端模式: true,
})
