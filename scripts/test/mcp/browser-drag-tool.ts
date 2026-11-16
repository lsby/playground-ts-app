import { 执行浏览器操作并观察 } from './browser-observation'
import type { 工具注册函数, 工具输出 } from './register-tool'
import { 定位目标, 浏览器拖动模型, 浏览器观察参数模型 } from './tool-input'
import type { MCP测试工具宿主 } from './tools'

export function 注册浏览器拖动工具(注册: 工具注册函数, 宿主: MCP测试工具宿主): void {
  let 观察说明 =
    ' On success, returns screen observations. observe=false skips observation. Use explicit waits for business readiness.'
  注册(
    'browser_drag',
    `Drag between two observed CSS viewport points within one uniquely located canvas. Both endpoints must be inside the visible canvas and viewport; replay uses the same canvas locator and coordinates.${观察说明}`,
    浏览器拖动模型.extend(浏览器观察参数模型.shape),
    ({ name, target, source, destination, timeoutMs, observe }, 信号) =>
      宿主.执行(
        (工具): Promise<工具输出> =>
          执行浏览器操作并观察(
            工具,
            信号,
            name,
            async () => {
              let 引擎 = 工具.浏览器.获得(name)
              await 引擎.拖动画布(定位目标(引擎, target), source, destination, timeoutMs)
              return { dragged: true }
            },
            false,
            observe,
            { 记录地址: true },
          ),
      ),
  )
}
