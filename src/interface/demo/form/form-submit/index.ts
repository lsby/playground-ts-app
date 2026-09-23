import {
  UrlEncoded参数解析插件,
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑UrlEncoded参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Either, Left, Right } from '@lsby/ts-fp-data'
import { z } from 'zod'

let 接口路径 = '/api/demo/form/form-submit' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑.构造(
  [new UrlEncoded参数解析插件(z.object({ username: z.string(), email: z.string().email() }).strict(), {})],
  async (参数, _逻辑附加参数, _请求附加参数): Promise<Either<'用户名已存在', { 注册成功: boolean; 详情: string }>> => {
    let 用户名 = 参数.urlencoded.username
    let 邮箱 = 参数.urlencoded.email

    if (用户名 === 'admin') {
      return new Left('用户名已存在' as const)
    }

    return new Right({ 注册成功: true, 详情: `用户: ${用户名}, 邮箱: ${邮箱}，已成功通过 Form 表单方式注册。` })
  },
)

type _接口逻辑UrlEncoded参数 = 计算接口逻辑UrlEncoded参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['用户名已存在'])
let 接口正确类型描述 = z.object({ 注册成功: z.boolean(), 详情: z.string() }).strip()

let 接口返回器 = new 常用接口返回器(接口错误类型描述, 接口正确类型描述)

export default new 接口(接口路径, 接口方法, 接口逻辑实现, 接口返回器)
