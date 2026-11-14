import { describe, expect, it } from 'vitest'
import {
  流程,
  行为,
  观察,
  需求,
  需求测试,
  验收点,
  type 需求测试流程,
  type 需求测试运行参数,
} from '../src/model/test-requirement'

let 验收 = new 验收点({ 名称: '验证', 描述: '验证状态' })
let 业务需求 = new 需求({ 名称: '需求', 描述: '测试', 验收点们: [验收] })

function 创建参数(): 需求测试运行参数 {
  let 取消信号 = new AbortController().signal
  return {
    取消信号,
    工具: {
      取消信号,
      服务地址: () => 'http://localhost',
      浏览器: {
        打开: async (): Promise<never> => {
          throw new Error('未使用')
        },
        获得: (): never => {
          throw new Error('未使用')
        },
        列出: () => [],
        关闭: async (): Promise<void> => {},
      },
      数据库: { 查询: () => [] },
      HTTP: {
        请求: async (): Promise<never> => {
          throw new Error('未使用')
        },
      },
      后端日志: { 读取: () => ({ 标准输出: '', 错误输出: '' }) },
    },
    执行步骤: async <结果>(
      提交: import('../src/model/test-requirement').提交步骤附件,
      _记录错误: (错误: unknown) => void,
      执行: () => Promise<结果>,
    ): Promise<结果> => {
      提交([{ 类型: '文本', 内容: '自动附件' }])
      return await 执行()
    },
    格式化错误: (错误) => ({ 文本: String(错误) }),
  }
}

class 测试容器 extends 需求测试 {
  public constructor(流程们: readonly 需求测试流程[]) {
    super([业务需求], 流程们, { 使用测试服务: false })
  }
}

describe('流程初始化', () => {
  it('每次运行初始化并传递工具及完整状态，支持不同状态的流程', async () => {
    let 次数 = 0
    let 参数 = 创建参数()
    type 数字状态 = { 工具: typeof 参数.工具; 数字: number }
    let 数字流程 = new 流程({
      名称: '数字',
      初始化: (工具): 数字状态 => ({ 工具, 数字: ++次数 }),
      覆盖验收点们: [验收],
      步骤们: [
        new 行为<数字状态>('增加', async (状态) => ({ ...状态, 数字: 状态.数字 + 1 })),
        new 观察<数字状态>('检查', (状态) => {
          expect(状态.工具).toBe(参数.工具)
          expect(状态.数字).toBe(次数 + 1)
        }),
      ],
    })
    let 文本流程 = new 流程({
      名称: '文本',
      初始化: (): { 文本: string } => ({ 文本: '初始' }),
      覆盖验收点们: [验收],
      步骤们: [
        new 观察<{ 文本: string }>('检查', (状态) => {
          expect(状态.文本).toBe('初始')
        }),
      ],
    })
    let 容器 = new 测试容器([数字流程, 文本流程])
    let 第一次 = await 容器.运行('数字', 参数)
    expect(第一次.状态).toBe('通过')
    expect(第一次.步骤们[0]).toMatchObject({
      名称: '初始化',
      类型: '初始化',
      状态: '通过',
      附件组们: [[{ 内容: '自动附件' }]],
    })
    expect((await 容器.运行('文本', 参数)).状态).toBe('通过')
    expect((await 容器.运行('数字', 参数)).状态).toBe('通过')
    expect(次数).toBe(2)
  })

  it('初始化失败时保留附件，后续步骤不执行', async () => {
    let 测试流程 = new 流程({
      名称: '失败',
      初始化: (): { 值: number } => {
        throw new Error('初始化失败')
      },
      覆盖验收点们: [验收],
      步骤们: [
        new 观察('不会执行', () => {
          throw new Error('不应执行')
        }),
      ],
    })
    let 结果 = await new 测试容器([测试流程]).运行('失败', 创建参数())
    expect(结果.状态).toBe('失败')
    expect(结果.步骤们[0]).toMatchObject({
      名称: '初始化',
      类型: '初始化',
      状态: '失败',
      附件组们: [[{ 内容: '自动附件' }]],
    })
    expect(结果.步骤们[1]).toMatchObject({ 状态: '未执行' })
    expect(结果.证明验收点们).toEqual([])
  })

  it('初始化中断时记录中断并保留附件', async () => {
    let 控制器 = new AbortController()
    let 参数 = 创建参数()
    参数.取消信号 = 控制器.signal
    let 测试流程 = new 流程({
      名称: '中断',
      初始化: (): { 值: number } => {
        控制器.abort()
        return { 值: 1 }
      },
      覆盖验收点们: [验收],
      步骤们: [
        new 观察<{ 值: number }>('不会执行', () => {
          throw new Error('不应执行')
        }),
      ],
    })
    let 结果 = await new 测试容器([测试流程]).运行('中断', 参数)
    expect(结果.状态).toBe('中断')
    expect(结果.步骤们[0]).toMatchObject({
      名称: '初始化',
      类型: '初始化',
      状态: '中断',
      附件组们: [[{ 内容: '自动附件' }]],
    })
    expect(结果.步骤们[1]).toMatchObject({ 状态: '未执行' })
  })
})
