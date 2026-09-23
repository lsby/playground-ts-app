import { z } from 'zod'

let 接口响应模式 = z.object({ status: z.enum(['success', 'fail', 'unexpected']), data: z.unknown() }).strict()
export type 标准接口响应 = { status: 'success' | 'fail' | 'unexpected'; data: unknown }

export function 是标准接口响应(值: unknown): 值 is 标准接口响应 {
  return 接口响应模式.safeParse(值).success
}

export function 解析接口响应(值: unknown): 标准接口响应 {
  if (typeof 值 !== 'object' || 值 === null || Object.hasOwn(值, 'data') === false) {
    throw new Error('接口响应缺少必要的 data 字段')
  }
  let 响应 = 接口响应模式.parse(值)
  if (
    响应.status === 'success' &&
    (typeof 响应.data !== 'object' || 响应.data === null || Array.isArray(响应.data) === true)
  ) {
    throw new Error('接口成功响应的 data 必须是对象')
  }
  return { status: 响应.status, data: 响应.data }
}
