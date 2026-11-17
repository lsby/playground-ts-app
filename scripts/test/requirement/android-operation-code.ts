import type { 操作调用条目 } from '../../../src/test-tools/operation-record'
import {
  安卓OCR点击模型,
  安卓坐标模型,
  安卓打开模型,
  安卓滑动模型,
  安卓目标操作模型,
  安卓等待模型,
  安卓输入模型,
  安卓配色模型,
  转换安卓目标,
} from '../mcp/android-input'
import { 无参数模型 } from '../mcp/tool-input'
import { 生成增强点击语句, type 模板资源 } from './enhanced-click-code'
import { 推算回放超时 } from './operation-timeout'

type 安卓调用代码 = { 名称: string; 类型: '行为' | '观察'; 语句们: string[]; 异步: true; 模板资源?: 模板资源 }

function 字面量(值: object | string | number): string {
  return JSON.stringify(值).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')
}

export function 生成安卓调用代码(
  条目: 操作调用条目,
  需要结果: boolean,
  流程文件名前缀 = 'template',
): 安卓调用代码 | undefined {
  let 名称 = 条目.notes?.trim()
  let 基本 = { 名称: 名称 === undefined || 名称 === '' ? 条目.tool : 名称, 类型: '行为' as const, 异步: true as const }
  let 参数 = 条目.arguments
  let 保存结果 = (表达式: string): string[] => (需要结果 ? [`当前状态.结果们.set(${String(条目.id)}, ${表达式})`] : [])
  let 引擎 = 'let 引擎 = 当前状态.工具.Android.获得()'
  switch (条目.tool) {
    case 'android_appearance': {
      let { colorScheme } = 安卓配色模型.parse(参数)
      return {
        ...基本,
        语句们: [
          引擎,
          `await 引擎.设置网页配色方案(${字面量(colorScheme)})`,
          ...保存结果(`{ colorScheme: ${字面量(colorScheme)} }`),
        ],
      }
    }
    case 'android_open': {
      let { allowNotificationPrompt } = 安卓打开模型.parse(参数)
      let 选项 = allowNotificationPrompt === true ? '{ 允许通知询问: true }' : ''
      return { ...基本, 语句们: [`await 当前状态.工具.Android.打开(${选项})`, ...保存结果('{ opened: true }')] }
    }
    case 'android_inspect':
      无参数模型.parse(参数)
      return {
        ...基本,
        类型: '观察',
        语句们: [
          引擎,
          ...(需要结果
            ? ['let elements = await 引擎.观察界面()', ...保存结果('{ elements: [...elements] }')]
            : ['await 引擎.观察界面()']),
        ],
      }
    case 'android_inspect_web':
      无参数模型.parse(参数)
      return {
        ...基本,
        类型: '观察',
        语句们: [
          引擎,
          ...(需要结果 ? ['let tree = await 引擎.观察网页()', ...保存结果('{ tree }')] : ['await 引擎.观察网页()']),
        ],
      }
    case 'android_tap': {
      let { target } = 安卓目标操作模型.parse(参数)
      return {
        ...基本,
        语句们: [
          引擎,
          `await 引擎.点击(${字面量(转换安卓目标(target))}, ${String(推算回放超时(条目))})`,
          ...保存结果('{ clicked: true }'),
        ],
      }
    }
    case 'android_tap_at': {
      let { x, y } = 安卓坐标模型.parse(参数)
      // 录制时认出了落点元素就按元素点击，没有元素有截图模板就等图片后点击，都没有才点坐标
      let 增强点击 = 生成增强点击语句(条目, '安卓', 流程文件名前缀)
      return {
        ...基本,
        语句们: [
          引擎,
          ...(增强点击?.语句们 ?? [`await 引擎.点击坐标(${String(x)}, ${String(y)})`]),
          ...保存结果('{ clicked: true }'),
        ],
        ...(增强点击?.模板资源 === undefined ? {} : { 模板资源: 增强点击.模板资源 }),
      }
    }
    case 'android_tap_ocr': {
      let { text } = 安卓OCR点击模型.parse(参数)
      let 增强点击 = 生成增强点击语句(条目, '安卓', 流程文件名前缀)
      if (增强点击 !== undefined) {
        // 不再回放时 OCR；断言要用的 x、y 取录制时的值
        let 录制点 = 条目.status === 'passed' ? 条目.result : {}
        let 坐标结果 =
          typeof 录制点['x'] === 'number' && typeof 录制点['y'] === 'number'
            ? `, x: ${String(录制点['x'])}, y: ${String(录制点['y'])}`
            : ''
        return {
          ...基本,
          语句们: [引擎, ...增强点击.语句们, ...保存结果(`{ clicked: true${坐标结果} }`)],
          ...(增强点击.模板资源 === undefined ? {} : { 模板资源: 增强点击.模板资源 }),
        }
      }
      let 点击 = `await 引擎.点击截图文字(${字面量(text)})`
      return {
        ...基本,
        语句们: [引擎, ...(需要结果 ? [`let { x, y } = ${点击}`, ...保存结果('{ clicked: true, x, y }')] : [点击])],
      }
    }
    case 'android_swipe': {
      let { x1, y1, x2, y2, durationMs } = 安卓滑动模型.parse(参数)
      return {
        ...基本,
        语句们: [
          引擎,
          `await 引擎.滑动(${String(x1)}, ${String(y1)}, ${String(x2)}, ${String(y2)}, ${String(durationMs)})`,
          ...保存结果('{ swiped: true }'),
        ],
      }
    }
    case 'android_back':
      无参数模型.parse(参数)
      return { ...基本, 语句们: [引擎, 'await 引擎.返回()', ...保存结果('{ pressed: true }')] }
    case 'android_fill': {
      let { value } = 安卓输入模型.parse(参数)
      return { ...基本, 语句们: [引擎, `await 引擎.输入(${字面量(value)})`, ...保存结果('{ filled: true }')] }
    }
    case 'android_wait': {
      let { target, state } = 安卓等待模型.parse(参数)
      return {
        ...基本,
        类型: '观察',
        语句们: [
          引擎,
          `await 引擎.${state === 'visible' ? '验证可见' : '验证隐藏'}(${字面量(转换安卓目标(target))}, ${String(推算回放超时(条目))})`,
          ...保存结果(`{ state: ${字面量(state)} }`),
        ],
      }
    }
    case 'android_screenshot':
      无参数模型.parse(参数)
      return { ...基本, 类型: '观察', 语句们: [引擎, 'await 引擎.截图()', ...保存结果("{ mimeType: 'image/png' }")] }
  }
  return undefined
}
