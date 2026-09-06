import {
  接口,
  接口逻辑,
  服务器,
  自定义接口返回器,
  路径解析插件,
  静态文件返回器,
  type 服务器运行信息,
} from '@lsby/net-core'
import { Right } from '@lsby/ts-fp-data'
import path from 'path'
import { z } from 'zod'
import { 环境变量 } from '../global/env'
import { globalLog, kysely管理器, syncLogCallBack, 即时任务管理器, 定时任务管理器 } from '../global/global'
import { init } from '../init/init'
import { interfaceApiList } from '../interface/interface-list'
import { 报告系统情况任务 } from '../job/instant-job/report-system-status'
import { databaseBackupCron } from '../job/scheduled-job/database-backup'
import { onTimeAlarm } from '../job/scheduled-job/on-time-alarm'

type 应用状态 = '未启动' | '启动中' | '运行中' | '关闭中' | '已关闭'

class App {
  private static 单例 = new App()

  public static 获得单例(): App {
    return this.单例
  }

  private 服务: 服务器 | null = null
  private 启动Promise: Promise<服务器运行信息> | null = null
  private 关闭Promise: Promise<void> | null = null
  private 状态: 应用状态 = '未启动'

  private constructor() {}

  private 获得项目根路径(): string {
    if (环境变量.BUILD_TARGET === 'sea') {
      return path.resolve(import.meta.dirname, './')
    }
    if (环境变量.NODE_ENV === 'development' || 环境变量.NODE_ENV === 'test') {
      return path.resolve(import.meta.dirname, '../../')
    }
    return path.resolve(import.meta.dirname, '../../../')
  }

  private async 执行启动(): Promise<服务器运行信息> {
    await init()
    let log = globalLog.extend('service')
    await 定时任务管理器.执行([onTimeAlarm, databaseBackupCron])

    this.服务 = new 服务器({
      接口们: [
        ...interfaceApiList,
        new 接口(
          '/favicon.ico',
          'get',
          接口逻辑.构造([], async () => new Right({})),
          new 自定义接口返回器(z.never(), z.object({}), z.string(), z.object({}), (req, res, _data) => {
            res.statusCode = 404
            return res.end()
          }),
        ),
        new 接口(
          new RegExp('/public/.*'),
          'get',
          接口逻辑.构造([new 路径解析插件()], async (参数) => {
            let 项目根路径 = this.获得项目根路径()
            let 基准目录 = path.resolve(项目根路径, 'public')
            let 相对路径 = 参数.path.rawPath.replace(/^\/public\//, '')

            let 文件路径 = path.join(基准目录, 相对路径)

            // 路径遍历检查
            let 规范化文件路径 = path.resolve(文件路径)
            let 规范化基准目录 = path.resolve(基准目录)
            let 相对路径检查 = path.relative(规范化基准目录, 规范化文件路径)
            if (相对路径检查.startsWith('..') || path.isAbsolute(相对路径检查)) {
              return new Right({ filePath: '' })
            }

            return new Right({ filePath: 文件路径 })
          }),
          new 静态文件返回器({}),
        ),
        new 接口(
          new RegExp('/.*'),
          'get',
          接口逻辑.构造([new 路径解析插件()], async (参数) => {
            let 路径 = 参数.path.rawPath === '/' ? '/index.html' : 参数.path.rawPath
            let 项目根路径 = this.获得项目根路径()
            let web目录名 = 环境变量.NODE_ENV === 'test' ? 'test-outputs/web-test' : 'dist/src/web'
            let web根目录 = path.join(项目根路径, web目录名)

            let 基准目录 = path.resolve(web根目录)
            let 文件路径 = path.join(基准目录, 路径)

            // 路径遍历检查
            let 规范化文件路径 = path.resolve(文件路径)
            let 规范化基准目录 = path.resolve(基准目录)
            let 相对路径检查 = path.relative(规范化基准目录, 规范化文件路径)
            if (相对路径检查.startsWith('..') || path.isAbsolute(相对路径检查)) {
              return new Right({ filePath: '' })
            }

            return new Right({ filePath: 文件路径 })
          }),
          new 静态文件返回器({}),
        ),
      ],
      端口: 环境变量.APP_PORT,
      日志回调: syncLogCallBack,
    })
    let 服务信息 = await this.服务.run()

    await log.debug('已加载的api路径: %O', 服务信息.api)
    await log.debug('服务器地址: %O', 服务信息.ip)

    即时任务管理器.提交任务(报告系统情况任务)
    return 服务信息
  }

  public async run(): Promise<服务器运行信息> {
    if (this.状态 !== '未启动') throw new Error(`应用当前状态为“${this.状态}”，不能启动`)
    this.状态 = '启动中'
    this.启动Promise = this.执行启动()
    try {
      let 服务信息 = await this.启动Promise
      this.状态 = '运行中'
      return 服务信息
    } catch (启动错误) {
      try {
        await this.close()
      } catch (关闭错误) {
        throw new AggregateError([启动错误, 关闭错误], '应用启动失败，且回收资源时发生错误')
      }
      throw 启动错误
    }
  }

  private async 执行关闭(): Promise<void> {
    let 错误组: unknown[] = []
    if (this.服务 !== null) {
      try {
        await this.服务.close()
      } catch (错误) {
        错误组.push(错误)
      }
      this.服务 = null
    }
    let 任务关闭结果组 = await Promise.allSettled([定时任务管理器.关闭(), 即时任务管理器.关闭()])
    for (let 结果 of 任务关闭结果组) if (结果.status === 'rejected') 错误组.push(结果.reason)
    try {
      await kysely管理器.销毁()
    } catch (错误) {
      错误组.push(错误)
    }
    if (错误组.length > 0) throw new AggregateError(错误组, '关闭应用时有资源回收失败')
  }

  private async 开始关闭(): Promise<void> {
    if (this.关闭Promise === null) {
      this.状态 = '关闭中'
      this.关闭Promise = this.执行关闭().finally(() => {
        this.状态 = '已关闭'
      })
    }
    await this.关闭Promise
  }

  public async close(): Promise<void> {
    if (this.状态 === '启动中' && this.启动Promise !== null) {
      try {
        await this.启动Promise
      } catch (_错误) {}
    }
    await this.开始关闭()
  }
}

export let 应用单例 = App.获得单例()
