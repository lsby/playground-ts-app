import { 添加刻度边框 } from '../../../src/test-tools/observation-image'
import {
  安卓OCR点击模型,
  安卓仅观察开关模型,
  安卓坐标模型,
  安卓打开模型,
  安卓滑动模型,
  安卓目标操作模型,
  安卓等待模型,
  安卓输入模型,
  安卓配色模型,
  转换安卓目标,
  转换安卓等待目标,
} from './android-input'
import { 执行安卓操作并观察 } from './android-observation'
import { 识别坐标点击 } from './click-enhance'
import type { 工具注册函数, 工具输出 } from './register-tool'
import { 无参数模型 } from './tool-input'
import type { MCP测试工具宿主 } from './tools'

export function 注册安卓工具(注册: 工具注册函数, 宿主: MCP测试工具宿主): void {
  let 观察说明 =
    ' On success, samples the screen until stable or six seconds and returns up to three selected WebP images in chronological order with capture times. Each image has a ruler border whose numbers are the click coordinates. Use these images to choose the next action; use explicit waits for business readiness. observe=false skips observation. observationError means the action succeeded but observation failed.'
  注册(
    'android_open',
    `Open the configured Android local test app on the selected device.${观察说明}`,
    安卓打开模型,
    ({ allowNotificationPrompt, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行安卓操作并观察(
            工具,
            信号,
            async () => {
              await 工具.Android.打开({ 允许通知询问: allowNotificationPrompt === true })
              return { opened: true }
            },
            true,
            observe,
          ),
      ),
  )
  注册('android_inspect', 'Read the Android accessibility tree of the active test app.', 无参数模型, () =>
    宿主.执行(async (工具): Promise<工具输出> => {
      let elements = await 工具.Android.获得().观察界面()
      return { 数据: { elements: [...elements] } }
    }),
  )
  注册(
    'android_inspect_web',
    'Read the accessibility snapshot of the active test app WebView. Names in the snapshot are accessible names and often come from the element text, not from an aria-label attribute; locate by webText, or by a webSelector you have verified matches exactly one element.',
    无参数模型,
    () =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let tree = await 工具.Android.获得().观察网页()
        return { 数据: { tree } }
      }),
  )
  注册(
    'android_appearance',
    `Set the active Android test app WebView color scheme.${观察说明}`,
    安卓配色模型,
    ({ colorScheme, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行安卓操作并观察(
            工具,
            信号,
            async () => {
              await 工具.Android.获得().设置网页配色方案(colorScheme)
              return { colorScheme }
            },
            false,
            observe,
          ),
      ),
  )
  注册(
    'android_tap',
    `Tap the single Android element that exactly matches the target.${观察说明}`,
    安卓目标操作模型,
    ({ target, timeoutMs, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行安卓操作并观察(
            工具,
            信号,
            async () => {
              await 工具.Android.获得().点击(转换安卓目标(target), timeoutMs)
              return { clicked: true }
            },
            false,
            observe,
            { 记录地址: true },
          ),
      ),
  )
  注册(
    'android_tap_at',
    `Tap a point. x and y are the numbers printed on the ruler border around the observation image (the tick labels along the top and left edges), NOT pixel positions in the image file. Example: to tap a button that lines up with the ruler mark 350 on the top edge and the mark 820 on the left edge, pass x=350, y=820; do not estimate from the image's pixel size. Prefer locator-based or text-based click tools; coordinate clicks are only a fallback. Before tapping, the framework identifies the element under the point (through Shadow DOM) and exports an element-based click that waits for the element. When it cannot, it records a screenshot template (or the coordinate as a last resort) and adds a suggestion to give the element an aria-label; the response field locator says which. If the response has a warning, the tap landed on a non-interactive container instead of a control; check the screenshot.${观察说明}`,
    安卓坐标模型,
    ({ x, y, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行安卓操作并观察(
            工具,
            信号,
            async (上下文) => {
              let 引擎 = 工具.Android.获得()
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
            false,
            observe,
            { 记录地址: true, 需要操作前截图: true },
          ),
      ),
  )
  注册(
    'android_tap_ocr',
    `Find a single matching text line in a fresh screenshot and tap it through ADB. Before tapping, the framework identifies the element under the point (through Shadow DOM) and exports an element-based click that waits for the element. When it cannot, it records a screenshot template (or the coordinate as a last resort) and adds a suggestion to give the element an aria-label; the response field locator says which.${观察说明}`,
    安卓OCR点击模型,
    ({ text, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行安卓操作并观察(
            工具,
            信号,
            async (上下文) => {
              let 引擎 = 工具.Android.获得()
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
            false,
            observe,
            { 记录地址: true, 需要操作前截图: true },
          ),
      ),
  )
  注册(
    'android_swipe',
    `Swipe between screen coordinates in physical pixels.${观察说明}`,
    安卓滑动模型,
    ({ x1, y1, x2, y2, durationMs, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行安卓操作并观察(
            工具,
            信号,
            async () => {
              await 工具.Android.获得().滑动(x1, y1, x2, y2, durationMs)
              return { swiped: true }
            },
            false,
            observe,
            { 记录地址: true },
          ),
      ),
  )
  注册('android_back', `Press the Android system back button.${观察说明}`, 安卓仅观察开关模型, ({ observe }, 信号) =>
    宿主.执行(
      (工具): Promise<工具输出> =>
        执行安卓操作并观察(
          工具,
          信号,
          async () => {
            await 工具.Android.获得().返回()
            return { pressed: true }
          },
          false,
          observe,
          { 记录地址: true },
        ),
    ),
  )
  注册(
    'android_reload',
    `Reload only the current WebView page (full page reload) without restarting the app or clearing data. Waits for the load event of the new document. Use it after editing front-end code with the hot-reload build, or to reset page state.${观察说明}`,
    安卓仅观察开关模型,
    ({ observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行安卓操作并观察(
            工具,
            信号,
            async () => {
              await 工具.Android.获得().重新加载网页()
              return { reloaded: true }
            },
            false,
            observe,
            { 记录地址: true },
          ),
      ),
  )
  注册(
    'android_fill',
    `Enter synthetic ASCII text into the focused Android field. By default the text is APPENDED after whatever the field already contains. Set clear=true to clear the field first (up to 200 characters) and then type value (overwrite); with clear=true value may be "" to only empty the field. Text is recorded in plaintext, so never use real passwords, codes or private information.${观察说明}`,
    安卓输入模型,
    ({ value, clear, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行安卓操作并观察(
            工具,
            信号,
            async () => {
              await 工具.Android.获得().输入(value, { 清空: clear })
              return { filled: true }
            },
            false,
            observe,
            { 记录地址: true },
          ),
      ),
  )
  注册(
    'android_wait',
    'Wait for an Android target to become visible or hidden. Matches the full text exactly by default; set match=contains to match text that merely includes the value (for dynamic text such as dates or numbers). Fails on timeout.',
    安卓等待模型,
    (参数) =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 引擎 = 工具.Android.获得()
        let { state, timeoutMs } = 参数
        switch (state) {
          case 'visible':
            await 引擎.验证可见(转换安卓等待目标(参数), timeoutMs)
            break
          case 'hidden':
            await 引擎.验证隐藏(转换安卓等待目标(参数), timeoutMs)
            break
        }
        return { 数据: { state } }
      }),
  )
  注册(
    'android_screenshot',
    'Capture the current Android test app screen and return a fresh PNG image.',
    无参数模型,
    () =>
      宿主.执行(async (工具): Promise<工具输出> => {
        let 图片 = await 工具.Android.获得().截图()
        return {
          数据: { mimeType: 'image/png' },
          图片们: [
            {
              图片,
              模型图片: (await 添加刻度边框(图片, 图片.readUInt32BE(16), 图片.readUInt32BE(20), 'png')).图片,
              内容类型: 'image/png',
              说明: 'Android · 请求的截图 · 四周刻度数字就是点击坐标',
            },
          ],
        }
      }),
  )
}
