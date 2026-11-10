import { randomUUID } from 'node:crypto'
import { lstat, open, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as 等待 } from 'node:timers/promises'

import type { 测试建议 } from '../model/test-requirement'
import {
  测试录制,
  type JSON值,
  type JSON对象,
  type 回放步骤选择,
  type 导出回放步骤,
  type 操作记录摘要,
  type 操作记录条目,
  type 操作调用结果,
} from '../model/test-requirement/recording'

export type {
  JSON值,
  JSON对象,
  操作断言条目,
  操作记录摘要,
  操作记录条目,
  操作调用条目,
  操作调用结果,
  断言期望来源,
} from '../model/test-requirement/recording'

async function 替换记录文件(临时路径: string, 记录路径: string): Promise<void> {
  for (let 间隔 of [25, 75]) {
    try {
      await rename(临时路径, 记录路径)
      return
    } catch (错误) {
      // Windows 上短暂占用目标文件会阻止原子替换。重试期间保留原文件。
      if (
        process.platform !== 'win32' ||
        错误 instanceof Error === false ||
        'code' in 错误 === false ||
        (错误.code !== 'EPERM' && 错误.code !== 'EBUSY')
      )
        throw 错误
      await 等待(间隔)
    }
  }
  await rename(临时路径, 记录路径)
}

type 断言选项 = Parameters<测试录制['添加断言']>[3]
type 列出选项 = Parameters<测试录制['列出']>[2]

/** 将一次测试录制的操作串行提交到开发套件的记录文件。 */
export class 测试操作记录 {
  public readonly 文件路径: string
  private 录制: 测试录制 | undefined
  private 队列 = Promise.resolve()

  public constructor(输出目录: string) {
    if (path.isAbsolute(输出目录) === false) throw new Error('操作记录输出目录必须使用绝对路径')
    this.文件路径 = path.join(输出目录, 'operations.json')
  }

  public 初始化(): Promise<void> {
    return this.排队(async (): Promise<void> => {
      if (this.录制 !== undefined) return
      try {
        await lstat(this.文件路径)
        throw new Error(`操作记录已存在：${this.文件路径}`)
      } catch (错误) {
        if (错误 instanceof Error === false || 'code' in 错误 === false || 错误.code !== 'ENOENT') throw 错误
      }
      await this.提交(new 测试录制())
    })
  }

  public 开始(工具: string, 参数: JSON对象): Promise<number> {
    let 时间 = new Date().toISOString()
    return this.编辑((录制) => 录制.开始(工具, 参数, 时间))
  }

  public 完成(id: number, 结果: 操作调用结果): Promise<void> {
    let 时间 = new Date().toISOString()
    return this.编辑((录制) => 录制.完成(id, 结果, 时间))
  }

  public 列出(偏移: number, 数量: number, 选项?: 列出选项): Promise<{ total: number; entries: 操作记录摘要[] }> {
    return this.排队(() => this.获得录制().列出(偏移, 数量, 选项))
  }

  public 获得(id: number): Promise<操作记录条目> {
    return this.排队(() => this.获得录制().获得(id))
  }

  public 获得审阅(): Promise<{ 步骤们: 回放步骤选择[]; 备注们: ReturnType<测试录制['获得备注们']> }> {
    return this.排队(() => {
      let 录制 = this.获得录制()
      return { 步骤们: 录制.获得回放草稿(), 备注们: 录制.获得备注们() }
    })
  }

  public 更新说明(id: number, 说明: string | null | undefined, 决策说明?: string | null): Promise<void> {
    return this.编辑((录制) => 录制.更新说明(id, 说明, 决策说明))
  }

  public 添加建议(id: number, 建议: 测试建议): Promise<void> {
    return this.编辑((录制) => 录制.添加建议(id, 建议))
  }

  public 补录(说明: string): Promise<number> {
    let 时间 = new Date().toISOString()
    return this.编辑((录制) => 录制.补录(说明, 时间))
  }

  public 添加备注(编号们: readonly number[], 文本: string): Promise<number> {
    return this.编辑((录制) => 录制.添加备注(编号们, 文本))
  }

  public 更新备注(id: number, 文本: string | null): Promise<void> {
    return this.编辑((录制) => 录制.更新备注(id, 文本))
  }

  public 排除(编号们: readonly number[]): Promise<void> {
    return this.编辑((录制) => 录制.排除(编号们))
  }

  public 恢复(编号们: readonly number[]): Promise<void> {
    return this.编辑((录制) => 录制.恢复(编号们))
  }

  public 移动(id: number, 放在此编号前: number | null): Promise<void> {
    return this.编辑((录制) => 录制.移动(id, 放在此编号前))
  }

  public 分组(名称: string, 编号们: readonly number[]): Promise<void> {
    return this.编辑((录制) => 录制.分组(名称, 编号们))
  }

  public 拆组(id: number): Promise<void> {
    return this.编辑((录制) => 录制.拆组(id))
  }

  public 清空(): Promise<void> {
    return this.编辑((录制) => 录制.清空())
  }

  public 添加断言(
    来源ID: number,
    结果路径: readonly (string | number)[],
    期望: JSON值 | undefined,
    选项: 断言选项,
  ): Promise<number> {
    let 时间 = new Date().toISOString()
    return this.编辑((录制) => 录制.添加断言(来源ID, 结果路径, 期望, 选项, 时间))
  }

  public 准备导出(步骤组?: readonly 回放步骤选择[]): Promise<导出回放步骤[]> {
    return this.排队(() => this.获得录制().准备导出(步骤组))
  }

  private 编辑<T>(应用: (录制: 测试录制) => T): Promise<T> {
    return this.排队(async (): Promise<T> => {
      let 候选 = this.获得录制().复制()
      let 结果 = 应用(候选)
      await this.提交(候选)
      return 结果
    })
  }

  private 排队<T>(操作: () => T | Promise<T>): Promise<T> {
    let 本次 = this.队列.then(操作)
    // 错误由本次调用者处理，之后的操作仍从上次提交的录制开始。
    this.队列 = 本次.then(
      (): void => {},
      (): void => {},
    )
    return 本次
  }

  private 获得录制(): 测试录制 {
    if (this.录制 === undefined) throw new Error('操作记录尚未初始化')
    return this.录制
  }

  private async 提交(录制: 测试录制): Promise<void> {
    let 内容 = `${JSON.stringify(录制.快照(), null, 2)}\n`
    let 临时路径 = `${this.文件路径}.${randomUUID()}.tmp`
    let 文件 = await open(临时路径, 'wx', 0o600)
    try {
      try {
        await 文件.writeFile(内容, 'utf8')
        await 文件.sync()
      } finally {
        await 文件.close()
      }
      await 替换记录文件(临时路径, this.文件路径)
    } catch (错误) {
      try {
        await rm(临时路径, { force: true })
      } catch (清理错误) {
        throw new AggregateError([错误, 清理错误], '保存操作记录失败，临时文件也未能清理')
      }
      throw 错误
    }
    this.录制 = 录制
  }
}
