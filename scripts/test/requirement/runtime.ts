import { AsyncLocalStorage } from 'node:async_hooks'

import type { 浏览器测试模式 } from '../../../src/model/browser-test'
import type {
  提交步骤附件,
  测试数据库值,
  测试服务日志内容,
  需求测试工具,
  需求测试附件,
} from '../../../src/model/test-requirement'
import type { 测试服务, 测试服务日志位置 } from '../test-server'
import { 需求测试浏览器组 } from './browsers'
import { 需求测试数据库 } from './database'

type 步骤取证 = {
  提交: 提交步骤附件
  记录错误: (错误: unknown) => void
  日志起点: 测试服务日志位置 | undefined
  已结束: boolean
}

/** 框架为一次流程尝试提供的工具及其取证、资源释放边界。 */
export class 需求测试运行工具 {
  public readonly 工具: 需求测试工具
  private readonly 浏览器: 需求测试浏览器组
  private readonly 数据库 = new 需求测试数据库()
  private readonly 步骤 = new AsyncLocalStorage<步骤取证>()

  public constructor(
    private readonly 参数: {
      服务: 测试服务 | undefined
      附件目录: string
      模式: 浏览器测试模式
      取消信号: AbortSignal
    },
  ) {
    this.浏览器 = new 需求测试浏览器组({
      获得服务地址: (): string | undefined => 参数.服务?.获得服务地址(),
      附件目录: 参数.附件目录,
      模式: 参数.模式,
      取消信号: 参数.取消信号,
    })
    this.工具 = {
      取消信号: 参数.取消信号,
      服务地址: (): string => this.获得服务().获得服务地址(),
      浏览器: this.浏览器,
      数据库: {
        查询: (语句, 参数 = [], 报告列 = []): Record<string, 测试数据库值>[] => {
          let 步骤 = this.获得当前步骤()
          return this.数据库.查询(语句, 参数, 报告列, (生成文本): void => this.记录文本(步骤, 生成文本))
        },
      },
      后端日志: { 读取: (): 测试服务日志内容 => this.读取日志() },
    }
  }

  public async 执行步骤<T>(提交: 提交步骤附件, 记录错误: (错误: unknown) => void, 执行: () => Promise<T>): Promise<T> {
    let 日志起点 = this.参数.服务?.获得日志位置()
    let 步骤 = { 提交, 记录错误, 日志起点, 已结束: false }
    return await this.步骤.run(步骤, async (): Promise<T> => {
      try {
        return await this.浏览器.执行步骤(提交, 记录错误, 执行)
      } finally {
        let 服务 = this.参数.服务
        if (服务 !== undefined && 日志起点 !== undefined) {
          let 日志 = 服务.读取日志(日志起点)
          if (日志.标准输出.trim() !== '')
            this.记录文本(步骤, () => `后端日志（stdout，步骤期间收到）\n${日志.标准输出}`)
          if (日志.错误输出.trim() !== '')
            this.记录文本(步骤, () => `后端日志（stderr，步骤期间收到）\n${日志.错误输出}`)
        }
        步骤.已结束 = true
      }
    })
  }

  public async 收集附件(记录错误: (错误: unknown) => void): Promise<readonly 需求测试附件[]> {
    return await this.浏览器.收集附件(记录错误)
  }

  public async 关闭(): Promise<void> {
    try {
      this.数据库.关闭()
    } finally {
      await this.浏览器.关闭全部()
    }
  }

  private 获得服务(): 测试服务 {
    if (this.参数.服务 === undefined) throw new Error('当前需求流程未声明使用测试服务')
    return this.参数.服务
  }

  private 获得当前步骤(): 步骤取证 {
    this.参数.取消信号.throwIfAborted()
    let 步骤 = this.步骤.getStore()
    if (步骤 === undefined || 步骤.已结束) throw new Error('测试工具必须在当前流程步骤内使用')
    return 步骤
  }

  private 读取日志(): 测试服务日志内容 {
    let 服务 = this.获得服务()
    let { 日志起点 } = this.获得当前步骤()
    if (日志起点 === undefined) throw new Error('当前步骤缺少后端日志起点')
    return 服务.读取日志(日志起点)
  }

  private 记录文本(步骤: 步骤取证, 生成文本: () => string): void {
    try {
      步骤.提交([{ 类型: '文本', 内容: 生成文本() }])
    } catch (错误) {
      步骤.记录错误(错误)
    }
  }
}
