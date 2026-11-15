import type { JSONObject } from '@modelcontextprotocol/server'

import type { 测试建议 } from '../../../src/model/test-requirement'
import type { 落点探测结果 } from '../../../src/model/web-locate/candidates'
import type { 观察截图 } from '../../../src/test-tools/screen-observation'
import { 裁剪点击模板 } from '../../../src/test-tools/template-match'
import type { 录制增强输出 } from './register-tool'

/** 一次操作里自动识别出的回放信息：由操作包装器创建，操作过程中往里填，最后随工具结果一起交给注册器。 */
export class 操作增强收集器 {
  public 定位: { 种类: '选择器' | '文字'; 值: string; 说明: string } | undefined
  public 地址变化: { 前: string; 后: string } | undefined
  public 地址读取错误: string | undefined
  public 模板: 录制增强输出['模板'] | undefined
  public readonly 建议们: 测试建议[] = []
  public readonly 附加: JSONObject = {}

  public 输出(): { 录制增强?: 录制增强输出; 建议们?: readonly 测试建议[] } {
    let 增强: 录制增强输出 = {
      ...(this.定位 === undefined ? {} : { 定位: this.定位 }),
      ...(this.地址变化 === undefined ? {} : { 地址变化: this.地址变化 }),
      ...(this.地址读取错误 === undefined ? {} : { 地址读取错误: this.地址读取错误 }),
      ...(this.模板 === undefined ? {} : { 模板: this.模板 }),
    }
    return {
      ...(Object.keys(增强).length === 0 ? {} : { 录制增强: 增强 }),
      ...(this.建议们.length === 0 ? {} : { 建议们: this.建议们 }),
    }
  }
}

export type 坐标点击探测 = (x: number, y: number) => Promise<落点探测结果>

function 生成建议(点: { x: number; y: number }, 命中: string, 原因: string, 模板说明: string | undefined): 测试建议 {
  return {
    标题: '坐标点击没有唯一标签',
    现象: `坐标 (${String(点.x)}, ${String(点.y)}) 点中的是 ${命中}，没有唯一标签（${原因}）。`,
    影响:
      模板说明 === undefined
        ? '回放用落点周围的截图模板等目标出现后再点，页面换了样式或主题时可能找不到。'
        : `回放只能点原坐标，手机一卡、目标还没出现就会点空。${模板说明}`,
    改进方向: '建议加 aria-label（或唯一的 id、data 属性），录制时就能按元素点击。',
  }
}

/**
 * 坐标类点击（*_tap_at、*_tap_ocr、browser_click_at）真正点击之前调用：
 * 先在页面里认出落点元素并生成唯一定位；认不出就用点击前截图裁一块图片模板；模板也做不了就退回坐标。
 * 认不出可用定位时自动记一条建议。识别过程中的任何错误都只记进响应，不影响点击本身。
 */
export async function 识别坐标点击(
  收集器: 操作增强收集器,
  探测: 坐标点击探测 | undefined,
  点: { x: number; y: number },
  操作前截图: 观察截图 | undefined,
): Promise<void> {
  let 结果: 落点探测结果
  if (探测 === undefined) {
    结果 = { 状态: '无定位', 原因: '当前环境不能识别页面元素', 命中: '未知元素' }
  } else {
    try {
      结果 = await 探测(点.x, 点.y)
    } catch (错误) {
      let 原因 = 错误 instanceof Error ? 错误.message : String(错误)
      收集器.附加['locatorError'] = 原因
      结果 = { 状态: '无定位', 原因: `识别落点失败：${原因}`, 命中: '未知元素' }
    }
  }
  if (结果.状态 === '已识别') {
    收集器.定位 = { 种类: 结果.定位.种类, 值: 结果.定位.值, 说明: 结果.说明 }
    收集器.附加['locator'] = `已识别为 ${结果.说明}`
    return
  }
  let 模板说明: string | undefined
  if (操作前截图 === undefined) {
    模板说明 = '这次没有点击前的截图，没能做图片模板。'
  } else {
    try {
      let 裁剪 = await 裁剪点击模板(操作前截图.图片, 操作前截图.宽, 操作前截图.高, 点)
      if (裁剪.通过) {
        收集器.模板 = { 图片: 裁剪.图片, 比例: 裁剪.比例, 原坐标: { ...点 }, 落点: 裁剪.落点 }
        收集器.附加['locator'] = '没有唯一标签，已用落点周围的截图作为回放模板'
      } else {
        模板说明 = 裁剪.原因
      }
    } catch (错误) {
      模板说明 = `裁剪图片模板失败：${错误 instanceof Error ? 错误.message : String(错误)}`
    }
  }
  if (模板说明 !== undefined) 收集器.附加['locator'] = `没有唯一标签，回放将退回坐标。${模板说明}`
  收集器.建议们.push(生成建议(点, 结果.命中, 结果.原因, 模板说明))
}
