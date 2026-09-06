import bcrypt from 'bcryptjs'
import { randomBytes, randomUUID } from 'crypto'
import { version } from '../app/meta-info'
import { 系统配置ID } from '../global/const'
import { 环境变量 } from '../global/env'
import { globalLog, kysely管理器, 检查数据库是否可用 } from '../global/global'

export async function init(): Promise<void> {
  await 检查数据库是否可用()
  let log = globalLog.extend('init')

  await log.debug('检索系统配置...')
  let 系统数据 = await kysely管理器
    .获得句柄()
    .selectFrom('system_config')
    .selectAll()
    .where('id', '=', 系统配置ID)
    .executeTakeFirst()

  // 1. 处理 JWT 密钥
  let jwt密钥 = 系统数据?.jwt_secret
  if (jwt密钥 === undefined) {
    jwt密钥 = 环境变量.DEFAULT_JWT_SECRET === '' ? randomBytes(32).toString('hex') : 环境变量.DEFAULT_JWT_SECRET
  }

  // 2. 处理初始化逻辑
  if (系统数据?.is_initialized !== 1) {
    await log.debug('系统未初始化, 开始初始化流程...')

    let 初始密码 = 环境变量.DEFAULT_SYSTEM_PWD
    let 密码是生成的 = false
    if (初始密码 === '') {
      初始密码 = randomBytes(6).toString('hex') // 生成 12 位随机 16 进制字符串
      密码是生成的 = true
    }

    let 初始用户id = randomUUID()

    // 检查管理员是否存在
    let 用户存在判定 = await kysely管理器
      .获得句柄()
      .selectFrom('user')
      .select('id')
      .where('name', '=', 环境变量.DEFAULT_SYSTEM_USER)
      .executeTakeFirst()

    if (用户存在判定 === undefined) {
      await log.debug('创建管理员用户...')
      await kysely管理器.执行事务(async (trx) => {
        await trx
          .insertInto('user')
          .values({
            id: 初始用户id,
            name: 环境变量.DEFAULT_SYSTEM_USER,
            pwd: await bcrypt.hash(初始密码, 环境变量.BCRYPT_ROUNDS),
            is_admin: 1,
          })
          .execute()
        await trx.insertInto('user_config').values({ id: randomUUID(), user_id: 初始用户id, theme: '系统' }).execute()
      })
    }

    // 写入/更新系统配置
    await kysely管理器.获得句柄().deleteFrom('system_config').execute()
    await kysely管理器
      .获得句柄()
      .insertInto('system_config')
      .values({
        id: 系统配置ID,
        is_initialized: 1,
        enable_register: 0,
        enable_get_interface_type: 0,
        version: version,
        jwt_secret: jwt密钥,
      })
      .execute()

    if (密码是生成的) {
      console.log('\n' + '='.repeat(50))
      console.log('🚀 系统初始化完成！')
      console.log(`管理员账号: ${环境变量.DEFAULT_SYSTEM_USER}`)
      console.log(`初始随机密码: ${初始密码}`)
      console.log('请务必妥善保管并及时修改密码！')
      console.log('='.repeat(50) + '\n')
    }
    await log.debug('初始化流程结束')
  } else if (系统数据.version !== version) {
    await log.debug('初始化标记已存在, 且版本不一致, 更新系统版本号...')
    await kysely管理器
      .获得句柄()
      .updateTable('system_config')
      .set({ version: version })
      .where('id', '=', 系统配置ID)
      .execute()
    await log.debug('升级流程结束')
  } else {
    await log.debug('初始化标记已存在, 且版本一致, 正常启动')
  }
}
