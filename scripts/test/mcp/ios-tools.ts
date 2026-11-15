import type { JSONObject } from '@modelcontextprotocol/server'

import type { 苹果测试引擎 } from '../../../src/model/ios-test'
import type { 需求测试工具 } from '../../../src/model/test-requirement'
import { 添加刻度边框 } from '../../../src/test-tools/observation-image'
import { 识别坐标点击 } from './click-enhance'
import {
  苹果OCR点击模型,
  苹果仅观察开关模型,
  苹果坐标模型,
  苹果打开模型,
  苹果滑动模型,
  苹果目标操作模型,
  苹果等待模型,
  苹果网络模型,
  苹果输入模型,
  苹果配色模型,
  转换苹果目标,
} from './ios-input'
import { 执行苹果操作并观察 } from './ios-observation'
import type { 工具注册函数, 工具输出 } from './register-tool'
import type { 操作上下文 } from './screen-observation'
import { 无参数模型 } from './tool-input'
import type { MCP测试工具宿主 } from './tools'

async function 执行并观察(
  工具: 需求测试工具,
  信号: AbortSignal,
  observe: boolean,
  动作: (引擎: 苹果测试引擎, 上下文: 操作上下文) => Promise<JSONObject>,
  选项: { 需要操作前截图?: boolean; 记录地址?: boolean } = {},
): Promise<工具输出> {
  // 会改变页面的动作前后各读一次页面地址，变化会记进录制并导出成等地址
  return await 执行苹果操作并观察(工具, 信号, async (上下文) => await 动作(工具.iOS.获得(), 上下文), {
    观察: observe,
    ...(选项.需要操作前截图 === true ? { 需要操作前截图: true } : {}),
    记录地址: 选项.记录地址 ?? true,
  })
}

// Appium 会话被回收（超时）或 Appium 服务被停掉（fetch failed）后，任何 ios_* 工具都会报下面这类错误；
// 真正是否失效由 确保会话可用 探测，探测会话仍正常就不会重做
let 会话失效错误 = /invalid session id|session is either terminated or not started|no such session|fetch failed/iu

export function 注册苹果工具(注册: 工具注册函数, 宿主: MCP测试工具宿主): void {
  // 遇到会话失效：清掉旧会话、重建并重新打开 App（数据保留），再把这次操作重做一遍，不用人工 ios_restart。
  // ios_open 自己会探测失效会话，不在这里处理
  let 注册并自动重建: 工具注册函数 = (名称, 描述, 参数模型, 执行, 注解): void =>
    注册(
      名称,
      描述,
      参数模型,
      async (参数, 信号) => {
        let 结果 = await 执行(参数, 信号)
        if (名称 === 'ios_open' || 结果.结果.成功 === true || 会话失效错误.test(结果.结果.错误) === false) return 结果
        let 重建 = await 宿主.执行(
          async (工具): Promise<工具输出> => ({ 数据: { recreated: await 工具.iOS.确保会话可用() } }),
        )
        if (重建.结果.成功 === false || 重建.结果.值.数据['recreated'] !== true) return 结果
        return await 执行(参数, 信号)
      },
      注解,
    )
  let 观察说明 =
    ' On success, samples the screen until stable or six seconds and returns up to three selected WebP images in chronological order with capture times. Each image has a ruler border whose numbers are the click coordinates. Use these images to choose the next action; use explicit waits for business readiness. observe=false skips observation. observationError means the action succeeded but observation failed.'
  注册并自动重建(
    'ios_open',
    `Reinstall and open the configured iOS local test app on the selected simulator.${观察说明}`,
    苹果打开模型,
    ({ language, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行苹果操作并观察(
            工具,
            信号,
            async () => {
              await 工具.iOS.打开(language === undefined ? {} : { 语言: language })
              return { opened: true }
            },
            { 首次打开: true, 观察: observe },
          ),
      ),
  )
  注册并自动重建(
    'ios_inspect',
    'Read the native iOS accessibility tree (positions are in points). Use it for native elements outside the WebView.',
    无参数模型,
    () =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let elements = await 工具.iOS.获得().观察界面()
        return { 数据: { elements: [...elements] } }
      }),
  )
  注册并自动重建(
    'ios_observe',
    `Sample the current screen and return selected WebP images.${观察说明}`,
    无参数模型,
    (_参数, 信号) =>
      宿主.执行((工具): Promise<工具输出> => 执行苹果操作并观察(工具, 信号, async () => ({}), { 首次打开: true })),
  )
  注册并自动重建('ios_inspect_web', 'Read the accessibility snapshot of the active test app WebView.', 无参数模型, () =>
    宿主.执行(async (工具): Promise<工具输出> => {
      let tree = await 工具.iOS.获得().观察网页()
      return { 数据: { tree } }
    }),
  )
  注册并自动重建(
    'ios_tap',
    `Tap the single iOS element that exactly matches the target, with a real touch at its center.${观察说明}`,
    苹果目标操作模型,
    ({ target, timeoutMs, observe }, 信号) =>
      宿主.执行(
        async (工具): Promise<工具输出> =>
          await 执行并观察(工具, 信号, observe, async (引擎): Promise<JSONObject> => {
            await 引擎.点击(转换苹果目标(target), timeoutMs)
            return { clicked: true }
          }),
      ),
  )
  注册并自动重建(
    'ios_tap_at',
    `Tap a point. Use the numbers on the ruler around the observation image as coordinates. Prefer locator-based or text-based click tools; coordinate clicks are only a fallback. Before tapping, the framework identifies the element under the point (through Shadow DOM) and exports an element-based click that waits for the element. When it cannot, it records a screenshot template (or the coordinate as a last resort) and adds a suggestion to give the element an aria-label; the response field locator says which.${观察说明}`,
    苹果坐标模型,
    ({ x, y, observe }, 信号) =>
      宿主.执行(
        async (工具): Promise<工具输出> =>
          await 执行并观察(
            工具,
            信号,
            observe,
            async (引擎, 上下文): Promise<JSONObject> => {
              // 点击前先认出落点元素：能唯一定位就导出成按元素点击，认不出就用截图模板，再不行退回坐标
              await 识别坐标点击(
                上下文.增强,
                (落点x, 落点y) => 引擎.探测落点(落点x, 落点y),
                { x, y },
                上下文.操作前截图,
              )
              await 引擎.点击坐标(x, y)
              return { clicked: true }
            },
            { 需要操作前截图: true },
          ),
      ),
  )
  注册并自动重建(
    'ios_tap_ocr',
    `Find a single matching text line in a fresh screenshot and tap it with a real touch. Before tapping, the framework identifies the element under the point (through Shadow DOM) and exports an element-based click that waits for the element. When it cannot, it records a screenshot template (or the coordinate as a last resort) and adds a suggestion to give the element an aria-label; the response field locator says which.${观察说明}`,
    苹果OCR点击模型,
    ({ text, observe }, 信号) =>
      宿主.执行(
        async (工具): Promise<工具输出> =>
          await 执行并观察(
            工具,
            信号,
            observe,
            async (引擎, 上下文): Promise<JSONObject> => {
              let { x, y } = await 引擎.查找截图文字(text)
              await 识别坐标点击(
                上下文.增强,
                (落点x, 落点y) => 引擎.探测落点(落点x, 落点y),
                { x, y },
                上下文.操作前截图,
              )
              await 引擎.点击坐标(x, y)
              return { clicked: true, x, y }
            },
            { 需要操作前截图: true },
          ),
      ),
  )
  注册并自动重建(
    'ios_swipe',
    `Swipe between screen coordinates in points (not pixels).${观察说明}`,
    苹果滑动模型,
    ({ x1, y1, x2, y2, durationMs, observe }, 信号) =>
      宿主.执行(
        async (工具): Promise<工具输出> =>
          await 执行并观察(工具, 信号, observe, async (引擎): Promise<JSONObject> => {
            await 引擎.滑动(x1, y1, x2, y2, durationMs)
            return { swiped: true }
          }),
      ),
  )
  注册并自动重建(
    'ios_back',
    `Simulate the iOS back gesture by swiping from the left screen edge. It only works if the page responds to the edge gesture.${观察说明}`,
    苹果仅观察开关模型,
    ({ observe }, 信号) =>
      宿主.执行(
        async (工具): Promise<工具输出> =>
          await 执行并观察(工具, 信号, observe, async (引擎): Promise<JSONObject> => {
            await 引擎.返回()
            return { swiped: true }
          }),
      ),
  )
  注册并自动重建(
    'ios_restart',
    `Kill and relaunch the iOS test app without uninstalling it or clearing its data, then wait for the WebView to be ready again.${观察说明}`,
    苹果仅观察开关模型,
    ({ observe }, 信号) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        // 会话被 Appium 回收时先重建，再重启应用
        await 工具.iOS.确保会话可用()
        return await 执行并观察(
          工具,
          信号,
          observe,
          async (引擎): Promise<JSONObject> => {
            await 引擎.重启应用()
            return { restarted: true }
          },
          { 记录地址: false },
        )
      }),
  )
  注册并自动重建(
    'ios_fill',
    `Type synthetic text into the focused iOS field. Text is recorded in plaintext, so never use real passwords, codes or private information.${观察说明}`,
    苹果输入模型,
    ({ value, observe }, 信号) =>
      宿主.执行(
        async (工具): Promise<工具输出> =>
          await 执行并观察(工具, 信号, observe, async (引擎): Promise<JSONObject> => {
            await 引擎.输入(value)
            return { filled: true }
          }),
      ),
  )
  注册并自动重建(
    'ios_wait',
    'Wait for an exact iOS target to become visible or hidden. Fails on timeout.',
    苹果等待模型,
    ({ target, state, timeoutMs }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = 工具.iOS.获得()
        switch (state) {
          case 'visible':
            await 引擎.验证可见(转换苹果目标(target), timeoutMs)
            break
          case 'hidden':
            await 引擎.验证隐藏(转换苹果目标(target), timeoutMs)
            break
        }
        return { 数据: { state } }
      }),
  )
  注册并自动重建(
    'ios_appearance',
    `Switch the simulator system appearance between light and dark.${观察说明}`,
    苹果配色模型,
    ({ appearance, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行并观察(
            工具,
            信号,
            observe,
            async (引擎): Promise<JSONObject> => {
              await 引擎.设置配色方案(appearance)
              return { appearance }
            },
            { 记录地址: false },
          ),
      ),
  )
  注册并自动重建(
    'ios_network',
    'Switch the simulated network of the iOS test app: online, offline (airplane mode) or hang (connects but never replies). Existing connections are dropped; the state survives ios_restart.',
    苹果网络模型,
    ({ state }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        工具.iOS.获得().设置网络(state)
        return { 数据: { state } }
      }),
  )
  注册并自动重建(
    'ios_screenshot',
    'Capture the current iOS simulator screen and return a fresh PNG image.',
    无参数模型,
    () =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 图片 = await 工具.iOS.获得().截图()
        let { width, height } = await 工具.iOS.获得().读取窗口()
        let 模型图片 = (await 添加刻度边框(图片, width, height, 'png')).图片
        return {
          数据: { mimeType: 'image/png' },
          图片们: [{ 图片, 模型图片, 内容类型: 'image/png', 说明: 'iOS · 请求的截图 · 四周刻度数字就是点击坐标' }],
        }
      }),
  )
}
