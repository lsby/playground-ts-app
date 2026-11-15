import type { JSONObject } from '@modelcontextprotocol/server'

import type { 需求测试工具 } from '../../../src/model/test-requirement'
import { 比较地址变化 } from '../../../src/model/web-locate/page-url'
import { 观察画面, type 画面观察适配器, type 观察截图 } from '../../../src/test-tools/screen-observation'
import { 操作增强收集器 } from './click-enhance'
import type { 工具输出 } from './register-tool'

export type 操作上下文 = {
  /** 操作前基准截图；首次打开没有，观察关闭且不需要模板时也不截。 */
  操作前截图?: 观察截图 | undefined
  增强: 操作增强收集器
}
export type 操作选项 = {
  首次打开?: boolean
  观察?: boolean
  /** 提供后，操作前后各读一次页面地址，变化会记进录制，导出成等地址。 */
  读取地址?: (信号: AbortSignal) => Promise<string | undefined>
  /** 坐标点击要用操作前截图裁图片模板，即使不观察也要截。 */
  需要操作前截图?: boolean
}

async function 安全读取地址(
  读取: ((信号: AbortSignal) => Promise<string | undefined>) | undefined,
  信号: AbortSignal,
  增强: 操作增强收集器,
  时机: '操作前' | '操作后',
): Promise<string | undefined> {
  if (读取 === undefined) return undefined
  try {
    return await 读取(信号)
  } catch (错误) {
    // 读不到地址不影响动作，但把原因记进录制，方便排查为什么没有生成等地址
    信号.throwIfAborted()
    let 原因 = `${时机}：${错误 instanceof Error ? 错误.message : String(错误)}`
    增强.地址读取错误 = 增强.地址读取错误 === undefined ? 原因 : `${增强.地址读取错误}；${原因}`
    return undefined
  }
}

export async function 执行操作并观察(
  工具: Pick<需求测试工具, '取消信号'>,
  取消信号: AbortSignal,
  获得适配器: () => 画面观察适配器,
  操作: (上下文: 操作上下文) => Promise<JSONObject>,
  选项?: 操作选项,
): Promise<工具输出> {
  let 信号 = AbortSignal.any([工具.取消信号, 取消信号])
  信号.throwIfAborted()
  let 增强 = new 操作增强收集器()
  let 前地址 = await 安全读取地址(选项?.读取地址, 信号, 增强, '操作前')
  let 记录地址变化 = async (): Promise<void> => {
    增强.地址变化 = 比较地址变化(前地址, await 安全读取地址(选项?.读取地址, 信号, 增强, '操作后'))
  }
  if (选项?.观察 === false && 选项.需要操作前截图 !== true) {
    let 数据 = await 操作({ 增强 })
    await 记录地址变化()
    return { 数据, ...增强.输出(), ...(Object.keys(增强.附加).length === 0 ? {} : { 响应附加: 增强.附加 }) }
  }
  let 操作前 = 选项?.首次打开 === true ? undefined : await 获得适配器().截图(信号)
  信号.throwIfAborted()
  let 数据 = await 操作({ 操作前截图: 操作前, 增强 })
  if (选项?.观察 === false) {
    await 记录地址变化()
    return { 数据, ...增强.输出(), ...(Object.keys(增强.附加).length === 0 ? {} : { 响应附加: 增强.附加 }) }
  }
  try {
    let 观察 = await 观察画面(获得适配器(), 信号, 操作前)
    let { 帧们, ...元数据 } = 观察
    await 记录地址变化()
    return {
      数据,
      ...增强.输出(),
      响应附加: { ...元数据, frames: 帧们.map((帧) => ({ elapsedMs: 帧.时刻, final: 帧.最终画面 })), ...增强.附加 },
      图片们: 帧们.map((帧) => ({
        图片: 帧.图片,
        模型图片: 帧.刻度图片,
        内容类型: 'image/webp',
        说明: `操作后 ${String(帧.时刻)} 毫秒${帧.最终画面 ? ' · 最终采样画面' : ''} · 四周刻度数字就是点击坐标`,
      })),
    }
  } catch (错误) {
    // 动作已经成功，观察失败单独返回，避免调用方重复执行动作。
    await 记录地址变化()
    return {
      数据,
      ...增强.输出(),
      响应附加: { observationError: 错误 instanceof Error ? 错误.message : String(错误), ...增强.附加 },
    }
  }
}
