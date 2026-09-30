import { 默认请求附加参数 } from '@lsby/net-core'
import { Log } from '@lsby/ts-log'
import fs from 'fs'
import path from 'path'
import { 环境变量 } from '../../global/env'
import { globalLog, kysely管理器 } from '../../global/global'
import { 备份数据库 } from '../../interface/admin-sqlite/backup-database'
import { 定时任务上下文, 定时任务抽象类 } from '../../model/job-scheduled/scheduled-job'

class 定时任务实现 extends 定时任务抽象类 {
  public override 获得名称(): string {
    return '数据库备份'
  }
  public override async 获得cron表达式(): Promise<`${string} ${string} ${string} ${string} ${string} ${string}`> {
    return '0 0 0 * * *' // 每天0点执行
  }
  public override async 任务逻辑(上下文: 定时任务上下文): Promise<void> {
    let log = globalLog
      .extend('数据库自动备份')
      .pipe(async (level, namespace, content) => 上下文.输出日志(`[${level}] [${namespace}] ${content}`))

    await log.info('数据库备份定时任务开始执行')

    // 只有当DB_TYPE为sqlite时才执行备份

    try {
      await log.info('开始执行数据库备份')

      let 管理员用户 = await kysely管理器
        .获得句柄()
        .selectFrom('user')
        .select('id')
        .where('is_admin', '=', 1)
        .executeTakeFirst()
      if (管理员用户 === undefined) {
        throw new Error('没有管理员用户')
      }

      await log.info(`找到管理员用户ID：${管理员用户.id}`)
      await log.info(`备份路径：${环境变量.DB_BACKUP_PATH}`)

      await log.info('开始备份数据库')
      await 备份数据库.调用(
        {
          json: {},
          kysely: kysely管理器,
          ws操作: {
            关闭ws连接: async () => {},
            发送ws信息: async () => {},
            设置清理函数: async () => {},
            监听ws信息: async () => {},
          },
        },
        { isAuto: true, userId: 管理员用户.id },
        { ...默认请求附加参数, log, 请求id: '定时任务' },
      )
      await log.info('数据库备份完成')

      let 删除数量 = await this.清理旧备份(环境变量.DB_BACKUP_PATH, 环境变量.DB_BACKUP_RETENTION_DAYS, log)
      await log.info(`清理完成，共删除 ${删除数量} 个旧备份文件`)

      await log.info('数据库备份定时任务执行完成')
    } catch (错误) {
      await log.error(`数据库备份失败：${String(错误)}`)
      throw 错误
    }
  }

  private async 清理旧备份(备份目录: string, 保留天数: number, log: Log): Promise<number> {
    let 文件列表 = await fs.promises.readdir(备份目录)
    let 备份文件列表: Array<{ 名称: string; 修改时间: Date }> = []

    await log.info(`开始清理旧备份，保留天数：${保留天数}，备份目录：${备份目录}`)

    for (let 文件名 of 文件列表) {
      if (
        文件名.startsWith(`${环境变量.DB_BACKUP_PREFIX}${环境变量.DB_BACKUP_AUTO_PREFIX}`) &&
        文件名.endsWith('.db')
      ) {
        let 文件路径 = path.join(备份目录, 文件名)
        let 状态 = await fs.promises.stat(文件路径)
        备份文件列表.push({ 名称: 文件名, 修改时间: 状态.mtime })
      }
    }

    await log.info(`找到 ${备份文件列表.length} 个备份文件`)

    // 按修改时间排序，最旧的在前
    备份文件列表.sort((a, b) => a.修改时间.getTime() - b.修改时间.getTime())

    let 当前时间 = new Date()
    let 保留时间阈值 = new Date(当前时间.getTime() - 保留天数 * 24 * 60 * 60 * 1000)

    let 删除数量 = 0
    for (let 备份文件 of 备份文件列表) {
      if (备份文件.修改时间 < 保留时间阈值) {
        let 文件路径 = path.join(备份目录, 备份文件.名称)
        await fs.promises.unlink(文件路径)
        删除数量 = 删除数量 + 1
        await log.info(`删除旧备份文件：${备份文件.名称}`)
      } else {
        // 由于已排序，后面的文件都比这个新，停止检查
        break
      }
    }

    return 删除数量
  }
}

export let databaseBackupCron = new 定时任务实现()
