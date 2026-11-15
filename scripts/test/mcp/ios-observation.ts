import type { JSONObject } from '@modelcontextprotocol/server'

import type { 需求测试工具 } from '../../../src/model/test-requirement'
import { 创建苹果观察适配器 } from '../../../src/test-tools/ios-observation'
import type { 工具输出 } from './register-tool'
import { 执行操作并观察, type 操作上下文 } from './screen-observation'

export async function 执行苹果操作并观察(
  工具: 需求测试工具,
  取消信号: AbortSignal,
  操作: (上下文: 操作上下文) => Promise<JSONObject>,
  选项: { 首次打开?: boolean; 观察?: boolean; 记录地址?: boolean; 需要操作前截图?: boolean } = {},
): Promise<工具输出> {
  let { 记录地址, ...其余 } = 选项
  return await 执行操作并观察(工具, 取消信号, () => 创建苹果观察适配器(工具.iOS.获得()), 操作, {
    ...其余,
    ...(记录地址 === true ? { 读取地址: (): Promise<string> => 工具.iOS.获得().读取地址() } : {}),
  })
}
