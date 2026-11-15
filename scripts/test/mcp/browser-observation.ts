import type { JSONObject } from '@modelcontextprotocol/server'

import type { 需求测试工具 } from '../../../src/model/test-requirement'
import { 创建浏览器观察适配器 } from '../../../src/test-tools/browser-observation'
import type { 工具输出 } from './register-tool'
import { 执行操作并观察, type 操作上下文 } from './screen-observation'

type 浏览器观察工具 = Pick<需求测试工具, '取消信号'> & { 浏览器: Pick<需求测试工具['浏览器'], '获得'> }

export async function 执行浏览器操作并观察(
  工具: 浏览器观察工具,
  取消信号: AbortSignal,
  名称: string,
  操作: (上下文: 操作上下文) => Promise<JSONObject>,
  首次打开 = false,
  观察 = true,
  选项: { 记录地址?: boolean; 需要操作前截图?: boolean } = {},
): Promise<工具输出> {
  return await 执行操作并观察(工具, 取消信号, () => 创建浏览器观察适配器(工具.浏览器.获得(名称)), 操作, {
    首次打开,
    观察,
    ...(选项.需要操作前截图 === true ? { 需要操作前截图: true } : {}),
    ...(选项.记录地址 === true ? { 读取地址: (): Promise<string> => 工具.浏览器.获得(名称).读取实时地址() } : {}),
  })
}
