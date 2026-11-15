import type { 工具注册函数, 工具输出 } from './register-tool'
import { 浏览器挂起请求模型, 浏览器等待请求模型, 浏览器释放请求模型 } from './tool-input'
import type { MCP测试工具宿主 } from './tools'

export function 注册浏览器请求工具(注册: 工具注册函数, 宿主: MCP测试工具宿主): void {
  注册(
    'browser_request_hold',
    'Hold exactly one real same-origin local POST response matching the exact path and top-level string body fields. Forwards once without retries or response substitution. Returns immediately after arming; wait for response-ready before releasing.',
    浏览器挂起请求模型,
    ({ name, requestId, path, bodyMatch }) =>
      宿主.执行(
        async (工具): Promise<工具输出> => ({
          数据: {
            ...(await 工具.浏览器
              .获得(name)
              .挂起请求({ 标识: requestId, 路径: path, 请求正文匹配: bodyMatch, 后端地址: 宿主.获得测试地址().后端 })),
          },
        }),
      ),
    { openWorldHint: false, destructiveHint: false },
  )
  注册(
    'browser_request_wait',
    'Wait for the held request to be captured, for its real upstream response, or for browser network completion. Fails on timeout/cancellation. Network completion does not mean application processing has completed; also wait for the business result.',
    浏览器等待请求模型,
    ({ name, requestId, state, timeoutMs }) =>
      宿主.执行(
        async (工具): Promise<工具输出> => ({
          数据: { ...(await 工具.浏览器.获得(name).等待挂起请求(requestId, state, timeoutMs)) },
        }),
      ),
    { openWorldHint: false, destructiveHint: false },
  )
  注册(
    'browser_request_release',
    'Deliver the already captured real response unchanged and wait for browser requestfinished. Requires response-ready. Returns HTTP status and a response hash, never response content or credentials.',
    浏览器释放请求模型,
    ({ name, requestId, timeoutMs }) =>
      宿主.执行(
        async (工具): Promise<工具输出> => ({
          数据: { ...(await 工具.浏览器.获得(name).释放挂起请求(requestId, timeoutMs)) },
        }),
      ),
    { openWorldHint: false, destructiveHint: false },
  )
}
