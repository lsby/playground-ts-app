import { AsyncLocalStorage } from 'node:async_hooks'

import type { 浏览器测试模式 } from '../model/browser-test'
import type { 苹果网络中转 } from '../model/ios-test'
import type {
  可等待结果,
  提交步骤附件,
  流程步骤附件,
  测试数据库值,
  测试数据库写入结果,
  测试数据库表结构,
  测试服务日志内容,
  需求测试工具,
  需求测试附件,
} from '../model/test-requirement'
import { 需求测试安卓设备 } from './android'
import { 需求测试浏览器组 } from './browsers'
import { 需求测试数据库 } from './database'
import { 请求测试后端 } from './http-request'
import { 需求测试苹果设备 } from './ios'

export type 测试服务日志位置 = { 标准输出: number; 错误输出: number }

type 测试工具后端 = {
  获得服务地址: () => string
  获得后端地址?: () => string
  获得日志位置: () => 测试服务日志位置
  读取日志: (起点: 测试服务日志位置) => 测试服务日志内容
}

type 步骤取证 = {
  提交: 提交步骤附件
  记录错误: (错误: unknown) => void
  日志起点: 测试服务日志位置 | undefined
  已结束: boolean
}

/** 在一次需求测试尝试或交互式会话内共享测试工具、步骤取证与资源释放。 */
export class 测试运行工具 {
  public readonly 工具: 需求测试工具
  private readonly 浏览器: 需求测试浏览器组
  private readonly 安卓设备: 需求测试安卓设备
  private readonly 苹果设备: 需求测试苹果设备
  private readonly 数据库: 需求测试数据库
  private readonly 步骤 = new AsyncLocalStorage<步骤取证>()

  public constructor(
    private readonly 参数: {
      服务: 测试工具后端 | undefined
      项目根目录: string
      附件目录: string
      模式: 浏览器测试模式
      取消信号: AbortSignal
      安卓设备?: string | undefined
      苹果设备?: string | undefined
      苹果热重载前端地址?: string | undefined
      苹果网络中转?: 苹果网络中转 | undefined
      安卓热重载?: { 前端地址: string; HMR端口: number } | undefined
    },
  ) {
    this.数据库 = new 需求测试数据库(参数.项目根目录)
    this.浏览器 = new 需求测试浏览器组({
      获得服务地址: (): string | undefined => 参数.服务?.获得服务地址(),
      附件目录: 参数.附件目录,
      模式: 参数.模式,
      取消信号: 参数.取消信号,
    })
    this.安卓设备 = new 需求测试安卓设备({
      项目根目录: 参数.项目根目录,
      设备: 参数.安卓设备,
      热重载: 参数.安卓热重载,
      获得后端地址: (): string => this.获得服务().获得后端地址?.() ?? this.获得服务().获得服务地址(),
      取消信号: 参数.取消信号,
    })
    this.苹果设备 = new 需求测试苹果设备({
      项目根目录: 参数.项目根目录,
      设备: 参数.苹果设备,
      热重载前端地址: 参数.苹果热重载前端地址,
      网络中转: 参数.苹果网络中转,
      获得后端地址: (): string => this.获得服务().获得后端地址?.() ?? this.获得服务().获得服务地址(),
      取消信号: 参数.取消信号,
    })
    this.工具 = {
      取消信号: 参数.取消信号,
      服务地址: (): string => this.获得服务().获得服务地址(),
      浏览器: this.浏览器,
      Android: this.安卓设备,
      iOS: this.苹果设备,
      数据库: {
        查询: (语句, 参数 = [], 报告列 = []): Record<string, 测试数据库值>[] => {
          let 步骤 = this.获得当前步骤()
          return this.数据库.查询(语句, 参数, 报告列, (生成文本): void => this.记录文本(步骤, 生成文本))
        },
        执行: (语句, 参数 = []): 测试数据库写入结果 => {
          let 步骤 = this.获得当前步骤()
          return this.数据库.执行(语句, 参数, (生成文本): void => this.记录文本(步骤, 生成文本))
        },
        表结构: (表们): 测试数据库表结构[] => {
          this.获得当前步骤()
          return this.数据库.表结构(表们)
        },
      },
      HTTP: {
        请求: (请求参数, 请求取消信号): ReturnType<typeof 请求测试后端> => {
          let 服务 = this.获得服务()
          let 取消信号们 = 请求取消信号 === undefined ? [参数.取消信号] : [参数.取消信号, 请求取消信号]
          return 请求测试后端(服务.获得后端地址?.() ?? 服务.获得服务地址(), 请求参数, 取消信号们)
        },
      },
      后端日志: { 读取: (): 测试服务日志内容 => this.读取日志() },
    }
  }

  public async 执行步骤<T>(
    提交: 提交步骤附件,
    记录错误: (错误: unknown) => void,
    执行: (提交附件: 提交步骤附件) => Promise<T>,
  ): Promise<T> {
    let 已提供图片 = false
    let 提交附件: 提交步骤附件 = (附件们, 选项) => {
      if (附件们.some((附件) => 附件.类型 === '图片')) 已提供图片 = true
      提交(附件们, 选项)
    }
    let 需要收尾截图 = (): boolean => 已提供图片 === false
    let 日志起点 = this.参数.服务?.获得日志位置()
    let 步骤 = { 提交, 记录错误, 日志起点, 已结束: false }
    return await this.步骤.run(步骤, async (): Promise<T> => {
      try {
        return await this.安卓设备.执行步骤(
          提交,
          记录错误,
          () =>
            this.苹果设备.执行步骤(
              提交,
              记录错误,
              () => this.浏览器.执行步骤(提交, 记录错误, () => 执行(提交附件), '步骤', 需要收尾截图),
              '步骤',
              需要收尾截图,
            ),
          '步骤',
          需要收尾截图,
        )
      } finally {
        let 服务 = this.参数.服务
        if (服务 !== undefined && 日志起点 !== undefined) {
          let 日志 = 服务.读取日志(日志起点)
          if (日志.标准输出.trim() !== '') this.记录文本(步骤, () => 日志.标准输出, 'stdout')
          if (日志.错误输出.trim() !== '') this.记录文本(步骤, () => 日志.错误输出, 'stderr')
        }
        步骤.已结束 = true
      }
    })
  }

  public async 收集附件(记录错误: (错误: unknown) => void): Promise<readonly 需求测试附件[]> {
    return await this.浏览器.收集附件(记录错误)
  }

  public 执行操作(提交: 提交步骤附件, 记录错误: (错误: unknown) => void, 执行: () => 可等待结果<void>): Promise<void> {
    return this.安卓设备.执行步骤(
      提交,
      记录错误,
      () =>
        this.苹果设备.执行步骤(
          提交,
          记录错误,
          () => this.浏览器.执行步骤(提交, 记录错误, async (): Promise<void> => await 执行(), '操作'),
          '操作',
        ),
      '操作',
    )
  }

  public async 关闭当前现场(): Promise<void> {
    try {
      await this.浏览器.归档并关闭当前会话()
    } finally {
      try {
        await this.安卓设备.关闭当前会话()
      } finally {
        try {
          await this.苹果设备.关闭当前会话()
        } finally {
          this.数据库.重置连接()
        }
      }
    }
  }

  public async 关闭(): Promise<void> {
    try {
      this.数据库.关闭()
    } finally {
      try {
        await this.浏览器.关闭全部()
      } finally {
        try {
          await this.安卓设备.关闭()
        } finally {
          await this.苹果设备.关闭()
        }
      }
    }
  }

  private 获得服务(): 测试工具后端 {
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

  private 记录文本(
    步骤: 步骤取证,
    生成文本: () => string,
    日志流?: Extract<流程步骤附件, { 类型: '文本' }>['日志流'],
  ): void {
    try {
      let 文本 = 生成文本()
      步骤.提交([
        日志流 === undefined
          ? { 类型: '文本', 内容: 文本 }
          : { 类型: '文本', 日志流, 内容: `后端日志（${日志流}，步骤期间收到）\n${文本}` },
      ])
    } catch (错误) {
      步骤.记录错误(错误)
    }
  }
}
