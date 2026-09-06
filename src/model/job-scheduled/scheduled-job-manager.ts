import schedule from 'node-schedule'
import { 已审阅的any } from '../../tools/types'
import { 定时任务抽象类 } from './scheduled-job'

export type 定时任务状态 = '未启动' | '运行中' | '已停止'
export type 定时任务执行结果 =
  | { 状态: '成功' }
  | { 状态: '失败'; 错误: Error }
  | { 状态: '跳过'; 原因: '正在运行' | '管理器已关闭' }
export type 定时任务信息 = {
  id: string
  名称: string
  表达式: string
  状态: 定时任务状态
  下次执行时间: Date | null
  最后执行时间: Date | null
  执行次数: number
}

export class 定时任务管理器类 {
  private 运行中 = false
  private 运行中任务Promise集合: Set<Promise<定时任务执行结果>> = new Set()
  private 调度任务列表: Array<{ 任务: 定时任务抽象类; job: schedule.Job; 信息: 定时任务信息 }> = []
  private 是否已关闭 = false
  private 关闭Promise: Promise<void> | null = null

  public constructor() {}

  private 检查是否已关闭(): void {
    if (this.是否已关闭 === true) throw new Error('定时任务管理器已关闭')
  }

  private 创建调度任务(任务: 定时任务抽象类, 任务信息: 定时任务信息, 表达式: string): schedule.Job {
    this.检查是否已关闭()
    let job = new schedule.Job(async (): Promise<void> => {
      await this.追踪任务执行(任务, 任务信息, job)
    })
    if (job.schedule(表达式) === false) throw new Error(`无效的 cron 表达式: ${表达式}`)
    return job
  }

  private async 追踪任务执行(
    任务: 定时任务抽象类,
    任务信息: 定时任务信息,
    job: schedule.Job,
  ): Promise<定时任务执行结果> {
    if (this.是否已关闭 === true) return { 状态: '跳过', 原因: '管理器已关闭' }
    let 运行Promise = this.执行任务(任务, 任务信息, job)
    this.运行中任务Promise集合.add(运行Promise)
    try {
      return await 运行Promise
    } finally {
      this.运行中任务Promise集合.delete(运行Promise)
    }
  }

  private async 执行任务(任务: 定时任务抽象类, 任务信息: 定时任务信息, job: schedule.Job): Promise<定时任务执行结果> {
    if (任务信息.状态 === '运行中') {
      await 任务.记录日志('任务已在执行中，跳过本次执行')
      return { 状态: '跳过', 原因: '正在运行' }
    }

    let 开始时间 = new Date()
    任务信息.状态 = '运行中'
    任务信息.最后执行时间 = 开始时间
    任务信息.下次执行时间 = job.nextInvocation()

    if (任务信息.执行次数 >= Number.MAX_SAFE_INTEGER - 1) {
      await 任务.记录日志('执行次数已达上限，重置为 0')
      任务信息.执行次数 = 0
    } else {
      任务信息.执行次数 = 任务信息.执行次数 + 1
    }

    try {
      let 上下文 = {
        任务名称: 任务.获得名称(),
        执行时间: 开始时间,
        输出日志: async (...args: 已审阅的any[]): Promise<void> => {
          await 任务.记录日志(...args)
        },
      }
      await 任务.任务逻辑(上下文)
      return { 状态: '成功' }
    } catch (错误) {
      let 错误对象 = 错误 instanceof Error ? 错误 : new Error(String(错误))
      await 任务.记录日志(`执行失败: ${错误对象.message}`)
      return { 状态: '失败', 错误: 错误对象 }
    } finally {
      任务信息.状态 = '未启动'
    }
  }

  public async 执行(任务列表: 定时任务抽象类[]): Promise<void> {
    this.检查是否已关闭()
    if (this.运行中) throw new Error('不可以多次启动')

    this.运行中 = true

    for (let 任务 of 任务列表) {
      let 表达式 = await 任务.获得cron表达式()
      this.检查是否已关闭()
      let 任务名 = 任务.获得名称()

      let 任务信息: 定时任务信息 = {
        id: crypto.randomUUID(),
        名称: 任务名,
        表达式,
        状态: '未启动',
        下次执行时间: null,
        最后执行时间: null,
        执行次数: 0,
      }

      let job = this.创建调度任务(任务, 任务信息, 表达式)

      任务信息.下次执行时间 = job.nextInvocation()
      this.调度任务列表.push({ 任务, job, 信息: 任务信息 })
    }
  }

  public 取消所有任务(): void {
    for (let { job } of this.调度任务列表) job.cancel()
    this.调度任务列表 = []
    this.运行中 = false
  }

  private async 执行关闭(): Promise<void> {
    this.是否已关闭 = true
    this.取消所有任务()
    let 关闭结果组 = await Promise.allSettled([...this.运行中任务Promise集合])
    let 错误组: unknown[] = []
    for (let 结果 of 关闭结果组) if (结果.status === 'rejected') 错误组.push(结果.reason)
    if (错误组.length > 0) throw new AggregateError(错误组, '关闭定时任务管理器时有任务执行失败')
  }

  public async 关闭(): Promise<void> {
    this.关闭Promise ??= this.执行关闭()
    await this.关闭Promise
  }

  public async 手动触发任务(任务id: string): Promise<boolean> {
    let 任务条目 = this.调度任务列表.find((item) => item.信息.id === 任务id)
    if (任务条目 === undefined) {
      return false
    }

    let 执行结果 = await this.追踪任务执行(任务条目.任务, 任务条目.信息, 任务条目.job)
    switch (执行结果.状态) {
      case '成功':
        await 任务条目.任务.记录日志('手动触发成功')
        return true
      case '失败':
        await 任务条目.任务.记录日志(`手动触发失败: ${执行结果.错误.message}`)
        return false
      case '跳过':
        await 任务条目.任务.记录日志(`手动触发已跳过: ${执行结果.原因}`)
        return false
    }
  }

  public 获取任务列表(): 定时任务信息[] {
    return this.调度任务列表.map((item) => ({ ...item.信息 }))
  }
  public 通过id获得任务(id: string): 定时任务抽象类 | null {
    let 任务条目 = this.调度任务列表.find((item) => item.信息.id === id)
    if (任务条目 === undefined) {
      return null
    }
    return 任务条目.任务
  }

  public async 刷新任务(): Promise<void> {
    this.检查是否已关闭()
    for (let 条目 of this.调度任务列表) {
      let { 任务, job, 信息 } = 条目
      let 旧表达式 = 信息.表达式
      let 新表达式 = await 任务.获得cron表达式()
      this.检查是否已关闭()
      if (新表达式 === 旧表达式) continue

      // 新调度创建成功后再取消旧调度，避免无效表达式导致任务丢失。
      let 新job = this.创建调度任务(任务, 信息, 新表达式)
      job.cancel()
      条目.job = 新job
      信息.表达式 = 新表达式
      信息.下次执行时间 = 新job.nextInvocation()
      await 任务.记录日志(`cron表达式已从 ${旧表达式} 更新为: ${新表达式}`)
    }
  }
}
