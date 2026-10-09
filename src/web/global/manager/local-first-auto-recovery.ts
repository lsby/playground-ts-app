import { 环境变量 } from '../../../global/env'
import { 同步快照 } from '../../../model/local-first/sync-model'
import { 激活本地优先状态, 读取本地优先状态 } from './local-first-state'
import { 采用本地优先权威快照 } from './local-first-sync'
import { 使用纯前端数据库锁 } from './pure-frontend-client'

export class 本地优先初始化恢复器 {
  public constructor(
    private 读取同步任务: () => Promise<void | string> | undefined,
    private 拉取远程快照: () => Promise<同步快照>,
  ) {}

  public async 确保已初始化(): Promise<void> {
    if (环境变量.BUILD_TARGET === 'pure-frontend') return
    await this.读取同步任务()?.catch((): void => {})
    if (读取本地优先状态() !== undefined) return
    let 远程快照 = await this.拉取远程快照()
    await 使用纯前端数据库锁(async (): Promise<void> => {
      if (读取本地优先状态() !== undefined) return
      if (激活本地优先状态(远程快照.userId) === true) return
      await 采用本地优先权威快照(远程快照)
    })
  }
}
