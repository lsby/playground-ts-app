import type { 操作调用条目 } from '../../../src/test-tools/operation-record'
import { 浏览器挂起请求模型, 浏览器等待请求模型, 浏览器释放请求模型 } from '../mcp/tool-input'

export function 生成请求调用代码(
  条目: 操作调用条目,
  需要结果: boolean,
): { 名称: string; 类型: '行为' | '观察'; 语句们: string[]; 异步: true } | undefined {
  let 说明 = 条目.notes?.trim()
  let 名称 = 说明 === undefined || 说明 === '' ? 条目.tool : 说明
  let 引擎 = (会话: string): string => `let 引擎 = 当前状态.工具.浏览器.获得(${JSON.stringify(会话)})`
  let 调用 = (语句: string): string =>
    `${需要结果 ? `当前状态.结果们.set(${String(条目.id)}, ` : ''}await ${语句}${需要结果 ? ')' : ''}`
  switch (条目.tool) {
    case 'browser_request_hold': {
      let { name, requestId, path, bodyMatch } = 浏览器挂起请求模型.parse(条目.arguments)
      return {
        名称,
        类型: '行为',
        异步: true,
        语句们: [
          引擎(name),
          调用(
            `引擎.挂起请求({ 标识: ${JSON.stringify(requestId)}, 路径: ${JSON.stringify(path)}, 请求正文匹配: ${JSON.stringify(bodyMatch)}, 后端地址: 当前状态.工具.服务地址() })`,
          ),
        ],
      }
    }
    case 'browser_request_wait': {
      let { name, requestId, state, timeoutMs } = 浏览器等待请求模型.parse(条目.arguments)
      return {
        名称,
        类型: '观察',
        异步: true,
        语句们: [
          引擎(name),
          调用(`引擎.等待挂起请求(${JSON.stringify(requestId)}, ${JSON.stringify(state)}, ${String(timeoutMs)})`),
        ],
      }
    }
    case 'browser_request_release': {
      let { name, requestId, timeoutMs } = 浏览器释放请求模型.parse(条目.arguments)
      return {
        名称,
        类型: '行为',
        异步: true,
        语句们: [引擎(name), 调用(`引擎.释放挂起请求(${JSON.stringify(requestId)}, ${String(timeoutMs)})`)],
      }
    }
  }
  return undefined
}
