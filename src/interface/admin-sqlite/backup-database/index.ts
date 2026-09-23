import {
  JSON参数解析插件,
  WebSocket插件,
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑JSON参数,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Right } from '@lsby/ts-fp-data'
import fs from 'fs'
import { CompiledQuery } from 'kysely'
import path from 'path'
import { z } from 'zod'
import { 环境变量 } from '../../../global/env'
import { kysely插件 } from '../../../global/plugin'
import { 检查管理员登录 } from '../../../interface-logic/check/check-login-jwt-admin'

let 接口路径 = '/api/admin-sqlite/backup-database' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(检查管理员登录)
  .绑定(
    接口逻辑.构造([], async (_参数, _逻辑附加参数, _请求附加参数) => {
      return new Right({ isAuto: false })
    }),
  )
  .绑定(
    接口逻辑.构造(
      [
        new JSON参数解析插件(z.object({}).strict(), {}),
        kysely插件,
        new WebSocket插件(z.object({ message: z.string() }).strict(), z.object({}).strict()),
      ],
      async (参数, 逻辑附加参数, 请求附加参数) => {
        let log = 请求附加参数.log
          .extend(接口路径)
          .pipe(async (level, namespace, content) =>
            参数.ws操作?.发送ws信息({ message: `[${level}] [${namespace}] ${content}` }),
          )

        let kysely = 参数.kysely.获得句柄()

        await log.info('开始备份数据库...')

        await log.info('获取备份目录...')
        let backupDir = 环境变量.DB_BACKUP_PATH
        await log.info(`备份目录: ${backupDir}`)

        await log.info('计算备份文件路径...')
        let envName = 环境变量.NODE_ENV
        let timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0]
        let backupFileName = `${环境变量.DB_BACKUP_PREFIX}${逻辑附加参数.isAuto ? 环境变量.DB_BACKUP_AUTO_PREFIX : ''}${envName}_${timestamp}.db`
        let backupPath = path.join(backupDir, backupFileName)
        await log.info(`备份文件路径: ${backupPath}`)

        await log.info('确保备份目录存在...')
        await fs.promises.mkdir(backupDir, { recursive: true })
        await log.info('备份目录已创建或已存在')

        await log.info('开始执行VACUUM INTO备份...')
        await kysely.executeQuery(CompiledQuery.raw(`VACUUM INTO '${backupPath}';`, []))
        await log.info('备份完成')

        return new Right({})
      },
    ),
  )

type _接口逻辑JSON参数 = 计算接口逻辑JSON参数<typeof 接口逻辑实现>
type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['未登录', '非管理员'])
let 接口正确类型描述 = z.object({}).strip()

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述))

export let 备份数据库 = 接口逻辑实现.获得最后接口()
