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
  苹果系统弹框模型,
  苹果网络模型,
  苹果输入模型,
  苹果配色模型,
  转换苹果目标,
  转换苹果等待目标,
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

export function 注册苹果工具(注册: 工具注册函数, 宿主: MCP测试工具宿主): void {
  let 观察说明 =
    ' On success, samples the screen until stable or six seconds and returns up to three selected WebP images in chronological order with capture times. Each image has a ruler border whose numbers are the click coordinates. Use these images to choose the next action; use explicit waits for business readiness. observe=false skips observation. observationError means the action succeeded but observation failed.'
  注册(
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
  注册(
    'ios_inspect',
    'Read the native iOS accessibility tree (positions are in points). Use it for native elements outside the WebView.',
    无参数模型,
    () =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = 工具.iOS.获得()
        let elements = await 引擎.观察界面()
        let 弹框 = await 引擎.读取系统弹框()
        return {
          数据: {
            elements: [...elements],
            // 系统弹框（通知权限等）不在上面的树里，用 ios_system_alert 处理
            systemAlert: 弹框 === undefined ? null : { text: 弹框.文字, buttons: 弹框.按钮们 },
          },
        }
      }),
  )
  注册(
    'ios_observe',
    `Sample the current screen and return selected WebP images.${观察说明}`,
    无参数模型,
    (_参数, 信号) =>
      宿主.执行((工具): Promise<工具输出> => 执行苹果操作并观察(工具, 信号, async () => ({}), { 首次打开: true })),
  )
  注册(
    'ios_inspect_web',
    'Read the accessibility snapshot of the active test app WebView. Each line shows where the name comes from: [aria-label="…"] means a real attribute, [名称来自文字，没有 aria-label] means the name is just the text, so a [aria-label=…] selector will not match it. Clickable controls end with a recommended locator (webSelector or webText) that was checked to match exactly one element, or say there is none; zero-size wrapper elements are skipped but their visible descendants are listed.',
    无参数模型,
    () =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let tree = await 工具.iOS.获得().观察网页()
        return { 数据: { tree } }
      }),
  )
  注册(
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
  注册(
    'ios_tap_at',
    `Tap a point. x and y are the numbers printed on the ruler border around the observation image (the tick labels along the top and left edges), NOT pixel positions in the image file. Example: to tap a button that lines up with the ruler mark 350 on the top edge and the mark 820 on the left edge, pass x=350, y=820; do not estimate from the image's pixel size. Prefer locator-based or text-based click tools; coordinate clicks are only a fallback. Before tapping, the framework identifies the element under the point (through Shadow DOM) and exports an element-based click that waits for the element. When it cannot, it records a screenshot template (or the coordinate as a last resort) and adds a suggestion to give the element an aria-label; the response field locator says which. If the response has a warning, the tap landed on a non-interactive container instead of a control; check the screenshot.${观察说明}`,
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
  注册(
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
  注册(
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
  注册(
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
  注册(
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
  注册(
    'ios_system_alert',
    `Tap a button on an iOS system alert (notification, location, photos permission and similar). These alerts are not in ios_inspect elements or the WebView, tapping coordinates is blocked by them, and tapping by native text cannot reach them; ios_inspect shows the current one as systemAlert. Choose accept or dismiss, optionally an exact button label. Set ifPresent to true when the alert may not appear (permission already decided) so replay does not fail. Recorded and replayed.${观察说明}`,
    苹果系统弹框模型,
    ({ action, button, ifPresent, observe }, 信号) =>
      宿主.执行(
        async (工具): Promise<工具输出> =>
          await 执行并观察(工具, 信号, observe, async (引擎): Promise<JSONObject> => {
            let handled = await 引擎.处理系统弹框(action, {
              ...(button === undefined ? {} : { 按钮文字: button }),
              仅当出现时: ifPresent,
            })
            return { handled }
          }),
      ),
  )
  注册(
    'ios_reload',
    `Reload only the current WebView page (full page reload) without restarting the app, reinstalling it or clearing data; the app process stays the same. Waits until the new document finishes loading. Use it after editing front-end code with the hot-reload build, or to reset page state. Use ios_restart to kill and relaunch the app.${观察说明}`,
    苹果仅观察开关模型,
    ({ observe }, 信号) =>
      宿主.执行(
        async (工具): Promise<工具输出> =>
          await 执行并观察(工具, 信号, observe, async (引擎): Promise<JSONObject> => {
            await 引擎.重新加载网页()
            return { reloaded: true }
          }),
      ),
  )
  注册(
    'ios_fill',
    `Type synthetic text into the focused iOS field. By default the text is APPENDED after whatever the field already contains. Set clear=true to clear the field first and then type value (overwrite); with clear=true value may be "" to only empty the field (for testing empty or all-space input, or entering numbers without concatenating onto the old value). Text is recorded in plaintext, so never use real passwords, codes or private information.${观察说明}`,
    苹果输入模型,
    ({ value, clear, observe }, 信号) =>
      宿主.执行(
        async (工具): Promise<工具输出> =>
          await 执行并观察(工具, 信号, observe, async (引擎): Promise<JSONObject> => {
            await 引擎.输入(value, { 清空: clear })
            return { filled: true }
          }),
      ),
  )
  注册(
    'ios_wait',
    'Wait for an iOS target to become visible or hidden. Matches the full text exactly by default; set match=contains to match text that merely includes the value (for dynamic text such as dates or numbers). Fails on timeout.',
    苹果等待模型,
    (参数) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = 工具.iOS.获得()
        let { state, timeoutMs } = 参数
        switch (state) {
          case 'visible':
            await 引擎.验证可见(转换苹果等待目标(参数), timeoutMs)
            break
          case 'hidden':
            await 引擎.验证隐藏(转换苹果等待目标(参数), timeoutMs)
            break
        }
        return { 数据: { state } }
      }),
  )
  注册(
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
  注册(
    'ios_network',
    'Switch the simulated network of the iOS test app: online, offline (airplane mode), hang (connects but never replies) maintenance (server upgrade: 503 JSON, preflight 204) or crash (main service down: 502 JSON, preflight 204). Existing connections are dropped; the state survives ios_restart.',
    苹果网络模型,
    ({ state }) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        工具.iOS.获得().设置网络(state)
        return { 数据: { state } }
      }),
  )
  注册('ios_screenshot', 'Capture the current iOS simulator screen and return a fresh PNG image.', 无参数模型, () =>
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
