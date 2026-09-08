import {
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑JSON参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { z } from 'zod'
import { jwt插件, kysely插件 } from '../../../../../global/plugin'
import { 检查JSON参数 } from '../../../../../interface-logic/check/check-json-args'
import { 检查管理员登录 } from '../../../../../interface-logic/check/check-login-jwt-admin'
import { 更新逻辑 } from '../../../../../interface-logic/components/crud/update'

let 接口路径 = '/api/demo/crud/user/update' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(new 检查管理员登录([jwt插件.解析器, kysely插件], () => ({ 表名: 'user', id字段: 'id', 标识字段: 'is_admin' })))
  .绑定(new 检查JSON参数(z.object({ userId: z.string(), newName: z.string() })))
  .绑定(
    new 更新逻辑(kysely插件, 'user', async (data) => ({
      条件们: [['id', '=', data.userId]],
      更新数据: { name: data.newName },
    })),
  )

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['验证JSON参数失败', '未登录', '非管理员'])
let 接口正确类型描述 = z.object({})

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述), {
  支持纯前端模式: true,
})
