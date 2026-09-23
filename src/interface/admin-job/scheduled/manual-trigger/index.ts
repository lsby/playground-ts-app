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
import { 定时任务管理器 } from '../../../../global/global'
import { 检查管理员登录 } from '../../../../interface-logic/check/check-login-jwt-admin'
import { 集线器监听器宿主 } from '../../../../model/hub/hub-model'

let 接口路径 = '/api/admin-job/scheduled/manual-trigger' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(检查管理员登录)
  .绑定(
    接口逻辑.构造(
      [new JSON参数解析插件(z.object({ 任务id: z.string() }).strict(), {})],
      async (参数, 逻辑附加参数, 请求附加参数) => {
        let log = 请求附加参数.log.extend(接口路径)
        let 任务 = 定时任务管理器.通过id获得任务(参数.json.任务id)
        if (任务 === null) {
          return new Right({ 成功: false })
        }
        let 宿主 = new 集线器监听器宿主()
        任务.添加定时任务日志监听器(async (日志) => {
          await log.debug(日志.消息)
        }, 宿主)
        try {
          let 成功 = await 定时任务管理器.手动触发任务(参数.json.任务id)
          return new Right({ 成功 })
        } finally {
          宿主.解绑()
        }
      },
    ),
  )

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['未登录', '非管理员'])
let 接口正确类型描述 = z.object({ 成功: z.boolean() }).strip()

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述))
