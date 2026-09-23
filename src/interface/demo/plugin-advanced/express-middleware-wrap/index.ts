import { 常用接口返回器, 接口, 接口逻辑, 插件 } from '@lsby/net-core'
import { Either, Left, Right } from '@lsby/ts-fp-data'
import express from 'express'
import { format } from 'node:util'
import { z } from 'zod'

// 假设我们直接复用 Express 官方提供的 express.json 中间件
let 原生JSON中间件 = express.json({})

let 错误响应描述Zod = z.object({ code: z.literal(400), data: z.string() }).strict()

export class 包装版JSON解析插件<目标Zod extends z.AnyZodObject> extends 插件<
  typeof 错误响应描述Zod,
  z.ZodObject<{ parsedBody: 目标Zod }>
> {
  public constructor(private 验证器Zod: 目标Zod) {
    let 正确响应描述Zod = z.object({ parsedBody: 验证器Zod }).strict()

    super(
      错误响应描述Zod,
      正确响应描述Zod,
      async (
        请求,
        响应,
        请求附加参数,
      ): Promise<Either<{ code: 400; data: string }, { parsedBody: z.infer<目标Zod> }>> => {
        let 日志 = 请求附加参数.log.extend('包装版JSON解析插件')

        // 使用 Promise 将基于回调 callback/next 的原生中间件封装成阻塞协程
        await new Promise<void>((解析完成) => {
          原生JSON中间件(请求, 响应, () => {
            解析完成()
          })
        })

        // 中间件处理完毕后会把数据挂载在原始请求的 body 上，我们提取并使用 Zod 校验
        let 校验结果 = this.验证器Zod.safeParse(请求.body)
        if (校验结果.success === false) {
          let 错误详情 = format('JSON格式非法或字段不匹配: %s', JSON.stringify(校验结果.error))
          await 日志.error(错误详情)
          return new Left({ code: 400, data: 错误详情 })
        }

        await 日志.debug('成功通过包装插件解析并验证 JSON 请求体数据')
        return new Right({ parsedBody: 校验结果.data })
      },
    )
  }
}

let 接口路径 = '/api/demo/plugin-advanced/express-middleware-wrap' as const
let 接口方法 = 'post' as const

let 目标数据验证 = z.object({ a: z.number(), b: z.number() }).strict()

let 接口逻辑实现 = 接口逻辑.构造(
  [new 包装版JSON解析插件(目标数据验证)],
  async (参数, _逻辑附加参数, _请求附加参数): Promise<Either<never, { result: number }>> => {
    // 参数.parsedBody 的类型已经被完全安全地推导出来，且有 a, b 属性
    let 数值A = 参数.parsedBody.a
    let 数值B = 参数.parsedBody.b

    return new Right({ result: 数值A * 数值B })
  },
)

let 接口返回器 = new 常用接口返回器(z.never(), z.object({ result: z.number() }).strip())

export default new 接口(接口路径, 接口方法, 接口逻辑实现, 接口返回器)
