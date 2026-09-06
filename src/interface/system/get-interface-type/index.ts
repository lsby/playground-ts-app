import { 接口, 接口逻辑, 自定义接口返回器, 计算接口逻辑正确结果, 计算接口逻辑错误结果 } from '@lsby/net-core'
import { Either, Left, Right } from '@lsby/ts-fp-data'
import fs from 'fs/promises'
import path from 'path'
import { z } from 'zod'
import { 系统配置ID } from '../../../global/const'
import { 环境变量 } from '../../../global/env'
import { kysely插件 } from '../../../global/plugin'

let 接口路径 = '/api/system/get-interface-type' as const
let 接口方法 = 'get' as const

let 获得类型文件路径 = (): string => {
  if (环境变量.BUILD_TARGET === 'sea') {
    return path.resolve(import.meta.dirname, './src/types/interface-type.ts')
  }
  if (环境变量.NODE_ENV === 'development' || 环境变量.NODE_ENV === 'test') {
    return path.join(path.resolve(import.meta.dirname, '../../../../'), 'src/types/interface-type.ts')
  }
  return path.join(path.resolve(import.meta.dirname, '../../../../../'), 'dist/src/types/interface-type.ts')
}

let 接口逻辑实现 = 接口逻辑.构造(
  [kysely插件],
  async (参数, _逻辑附加参数, _请求附加参数): Promise<Either<'该接口未开放', { data: string }>> => {
    let 配置 = await 参数.kysely
      .获得句柄()
      .selectFrom('system_config')
      .select('enable_get_interface_type')
      .where('id', '=', 系统配置ID)
      .executeTakeFirst()
    if (配置 === undefined || 配置.enable_get_interface_type !== 1) {
      return new Left('该接口未开放' as const)
    }

    let 类型文件路径 = 获得类型文件路径()
    let 文件内容 = await fs.readFile(类型文件路径, 'utf-8')
    return new Right({ data: 文件内容 })
  },
)

type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['该接口未开放'])
let 接口正确类型描述 = z.object({ data: z.string() })

let 自定义返回处理器 = new 自定义接口返回器(
  接口错误类型描述,
  接口正确类型描述,
  z.string(),
  z.string(),
  (请求, 响应, 数据): void => {
    if (数据.isLeft() === true) {
      响应.status(400).send(数据.assertLeft().getLeft())
      return
    }
    响应.setHeader('Content-Type', 'text/plain; charset=utf-8')
    响应.send(数据.assertRight().getRight().data)
    return
  },
)

export default new 接口(接口路径, 接口方法, 接口逻辑实现, 自定义返回处理器)
