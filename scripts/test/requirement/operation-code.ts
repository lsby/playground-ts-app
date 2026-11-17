import { z } from 'zod-mcp'
import { 推算回放超时 } from './operation-timeout'

import { HTTP请求模型 } from '../../../src/test-tools/http-request'
import type { 操作调用条目 } from '../../../src/test-tools/operation-record'
import {
  会话模型,
  写入模型,
  无参数模型,
  查询模型,
  浏览器拖动模型,
  浏览器环境模型,
  浏览器观察参数模型,
  目标操作模型,
  页面地址模型,
  页面模型,
  type 数据库参数,
  type 目标描述,
} from '../mcp/tool-input'
import { 生成安卓调用代码 } from './android-operation-code'
import { 生成增强点击语句, 生成等地址语句, type 引擎种类, type 模板资源 } from './enhanced-click-code'
import { 生成苹果调用代码 } from './ios-operation-code'
import { 生成请求调用代码 } from './request-operation-code'

export type 重放地址配置 = { 前端: string; 后端: string; 目录首页?: ReadonlyMap<string, string> }
type 生成选项 = {
  需要结果: boolean
  测试地址: 重放地址配置
  /** 流程文件名（不含 .ts），图片模板复制到 assets/ 时用它命名。 */
  流程文件名前缀?: string
}
type 生成结果 = {
  名称: string
  类型: '行为' | '观察'
  语句们: string[]
  需要查询结果工具?: true
  需要写入结果工具?: true
  异步?: true
  /** 录制时为坐标点击裁的图片模板，导出时要复制到需求目录的 assets/。 */
  模板资源?: 模板资源
}

function 生成名称(条目: 操作调用条目): string {
  let 名称 = 条目.notes?.trim()
  return 名称 === undefined || 名称 === '' ? 条目.tool : 名称
}

function 字面量(值: string | number | boolean | string[]): string {
  return JSON.stringify(值)
}

export function 生成重放地址(地址: string, 测试地址: 重放地址配置): string {
  if (地址.includes('*') || URL.canParse(地址, 测试地址.前端) === false) return 字面量(地址)
  let 绝对地址 = URL.canParse(地址)
  let 实际地址 = new URL(地址, 测试地址.前端)
  if ([测试地址.前端, 测试地址.后端].some((值) => new URL(值).origin === 实际地址.origin)) {
    let 首页 = 测试地址.目录首页?.get(实际地址.pathname)
    let 路径 = `${首页 ?? 实际地址.pathname}${实际地址.search}${实际地址.hash}`
    if (绝对地址 === true) return `new URL(当前状态.工具.服务地址()).origin + ${字面量(路径)}`
    if (首页 !== undefined) return 字面量(路径)
  }
  return 字面量(地址)
}

function 生成目标(目标: 目标描述, 根 = '引擎'): string {
  let 有范围 = 目标.within !== undefined
  if (目标.within !== undefined) 根 = 生成目标(目标.within)
  let 方法 = (中文: string, 原生: string): string => `${根}.${有范围 ? 原生 : 中文}`
  let 表达式: string
  switch (目标.by) {
    case 'role': {
      let 选项: string[] = []
      if (目标.name !== undefined) 选项.push(`name: ${字面量(目标.name)}`)
      if (目标.exact !== undefined) 选项.push(`exact: ${字面量(目标.exact)}`)
      表达式 = `${方法('按角色', 'getByRole')}(${字面量(目标.role)}${选项.length === 0 ? '' : `, { ${选项.join(', ')} }`})`
      break
    }
    case 'text':
    case 'label': {
      let 调用 = 目标.by === 'text' ? 方法('按文本', 'getByText') : 方法('按标签', 'getByLabel')
      let 文本 = 目标.by === 'text' ? 目标.text : 目标.label
      表达式 = `${调用}(${字面量(文本)}${目标.exact === undefined ? '' : `, { exact: ${字面量(目标.exact)} }`})`
      break
    }
    case 'selector':
      表达式 = `${方法('定位', 'locator')}(${字面量(目标.selector)})`
      break
  }
  return 目标.index === undefined ? 表达式 : `${表达式}.nth(${String(目标.index)})`
}

function 获得引擎(名称: string): string {
  return `let 引擎 = 当前状态.工具.浏览器.获得(${字面量(名称)})`
}

function 保存结果(条目: 操作调用条目, 选项: 生成选项, 表达式: string): string[] {
  return 选项.需要结果 ? [`当前状态.结果们.set(${String(条目.id)}, ${表达式})`] : []
}

function 生成页面操作(条目: 操作调用条目, 选项: 生成选项): 生成结果 | undefined {
  let 基本 = { 名称: 生成名称(条目), 类型: '行为' as const }
  let 参数 = 条目.arguments
  switch (条目.tool) {
    case 'browser_environment': {
      let { name, ...参数 } = 会话模型.extend(浏览器环境模型.shape).parse(条目.arguments)
      let 环境 = JSON.stringify(参数)
      return { ...基本, 语句们: [获得引擎(name), `await 引擎.设置显示环境(${环境})`, ...保存结果(条目, 选项, 环境)] }
    }
    case 'browser_history': {
      let { name, direction } = 会话模型.extend({ direction: z.enum(['back', 'forward']) }).parse(条目.arguments)
      return {
        ...基本,
        语句们: [
          获得引擎(name),
          `await 引擎.移动浏览器历史(${字面量(direction)})`,
          ...保存结果(条目, 选项, '{ url: 引擎.获得地址() }'),
        ],
      }
    }
    case 'browser_open': {
      let { name, url } = 页面模型.extend({ url: 页面地址模型.optional() }).parse(参数)
      let 语句们 = [`let 引擎 = await 当前状态.工具.浏览器.打开(${字面量(name)})`]
      if (url !== undefined)
        语句们.push(
          `await 引擎.导航(${生成重放地址(url, 选项.测试地址)}, { timeout: ${String(推算回放超时(条目))}, waitUntil: 'domcontentloaded' })`,
        )
      if (选项.需要结果) 语句们.push(...保存结果(条目, 选项, `{ name: ${字面量(name)}, url: 引擎.获得地址() }`))
      else if (url === undefined) 语句们[0] = `await 当前状态.工具.浏览器.打开(${字面量(name)})`
      return { ...基本, 语句们 }
    }
    case 'browser_close': {
      let { name } = 会话模型.parse(参数)
      return {
        ...基本,
        语句们: [
          `await 当前状态.工具.浏览器.关闭(${字面量(name)})`,
          ...保存结果(条目, 选项, `{ name: ${字面量(name)}, closed: true }`),
        ],
      }
    }
    case 'browser_list':
      无参数模型.parse(参数)
      return {
        ...基本,
        类型: '观察',
        语句们: 选项.需要结果
          ? 保存结果(条目, 选项, '{ names: [...当前状态.工具.浏览器.列出()] }')
          : ['当前状态.工具.浏览器.列出()'],
      }
    case 'browser_navigate':
    case 'browser_reload': {
      let { name } = 页面模型.extend(条目.tool === 'browser_navigate' ? { url: 页面地址模型 } : {}).parse(参数)
      let 地址 = 条目.tool === 'browser_navigate' ? 页面模型.extend({ url: 页面地址模型 }).parse(参数).url : undefined
      let 调用 =
        地址 === undefined
          ? `引擎.重新加载({ timeout: ${String(推算回放超时(条目))}, waitUntil: 'domcontentloaded' })`
          : `引擎.导航(${生成重放地址(地址, 选项.测试地址)}, { timeout: ${String(推算回放超时(条目))}, waitUntil: 'domcontentloaded' })`
      return {
        ...基本,
        语句们: [
          获得引擎(name),
          `${选项.需要结果 ? 'let 响应 = ' : ''}await ${调用}`,
          ...保存结果(条目, 选项, '{ url: 引擎.获得地址(), status: 响应?.status() ?? null }'),
        ],
      }
    }
    case 'browser_screenshot': {
      let { name } = 页面模型.parse(参数)
      return {
        ...基本,
        类型: '观察',
        语句们: [
          获得引擎(name),
          `await 引擎.截图(undefined, { timeout: ${String(推算回放超时(条目))} })`,
          ...保存结果(条目, 选项, "{ url: 引擎.获得地址(), mimeType: 'image/png' }"),
        ],
      }
    }
    case 'browser_inspect_page': {
      let { name } = 页面模型.parse(参数)
      let 调用 = `await 引擎.观察页面({ timeout: ${String(推算回放超时(条目))} })`
      return {
        ...基本,
        类型: '观察',
        语句们: [
          获得引擎(name),
          ...(选项.需要结果
            ? [
                `let { 地址, 标题, 页面结构 } = ${调用}`,
                ...保存结果(条目, 选项, '{ url: 地址, title: 标题, tree: 页面结构 }'),
              ]
            : [调用]),
        ],
      }
    }
    case 'browser_wait_url': {
      let { name, pattern } = 页面模型.extend({ pattern: z.string().trim().min(1) }).parse(参数)
      return {
        ...基本,
        类型: '观察',
        语句们: [
          获得引擎(name),
          `await 引擎.等待地址(${生成重放地址(pattern, 选项.测试地址)}, { timeout: ${String(推算回放超时(条目))}, waitUntil: 'domcontentloaded' })`,
          ...保存结果(条目, 选项, '{ url: 引擎.获得地址() }'),
        ],
      }
    }
    case 'browser_click_at': {
      let { name, x, y } = 会话模型.extend({ x: z.number().nonnegative(), y: z.number().nonnegative() }).parse(参数)
      // 录制时认出了落点元素就按元素点击，没有元素有截图模板就等图片后点击，都没有才点坐标
      let 增强点击 = 生成增强点击语句(条目, '浏览器', 选项.流程文件名前缀 ?? 'template')
      return {
        ...基本,
        语句们: [
          获得引擎(name),
          ...(增强点击?.语句们 ?? [`await 引擎.点击坐标(${String(x)}, ${String(y)})`]),
          ...保存结果(条目, 选项, '{ clicked: true }'),
        ],
        ...(增强点击?.模板资源 === undefined ? {} : { 模板资源: 增强点击.模板资源 }),
      }
    }
    case 'browser_drag': {
      let { name, target, source, destination } = 浏览器拖动模型.extend(浏览器观察参数模型.shape).parse(参数)
      return {
        ...基本,
        语句们: [
          获得引擎(name),
          `await 引擎.拖动画布(${生成目标(target)}, ${JSON.stringify(source)}, ${JSON.stringify(destination)}, ${String(推算回放超时(条目))})`,
          ...保存结果(条目, 选项, '{ dragged: true }'),
        ],
      }
    }
    case 'browser_press': {
      let { name, key } = 会话模型.extend({ key: z.string().trim().min(1) }).parse(参数)
      return {
        ...基本,
        语句们: [获得引擎(name), `await 引擎.按键(${字面量(key)})`, ...保存结果(条目, 选项, '{ pressed: true }')],
      }
    }
  }
  return undefined
}

function 生成目标操作(条目: 操作调用条目, 选项: 生成选项): 生成结果 | undefined {
  let 基本 = { 名称: 生成名称(条目), 类型: '行为' as const }
  let 参数 = 条目.arguments
  switch (条目.tool) {
    case 'browser_click':
    case 'browser_check': {
      let { name, target } = 目标操作模型.parse(参数)
      let 点击 = 条目.tool === 'browser_click'
      return {
        ...基本,
        语句们: [
          获得引擎(name),
          `await 引擎.${点击 ? '点击' : '勾选'}(${生成目标(target)}, { timeout: ${String(推算回放超时(条目))} })`,
          ...保存结果(条目, 选项, 点击 ? '{ clicked: true }' : '{ checked: true }'),
        ],
      }
    }
    case 'browser_fill': {
      let { name, target, value } = 目标操作模型.extend({ value: z.string() }).parse(参数)
      return {
        ...基本,
        语句们: [
          获得引擎(name),
          `await 引擎.输入(${生成目标(target)}, ${字面量(value)}, { timeout: ${String(推算回放超时(条目))} })`,
          ...保存结果(条目, 选项, '{ filled: true }'),
        ],
      }
    }
    case 'browser_select': {
      let { name, target, values } = 目标操作模型.extend({ values: z.array(z.string()).min(1) }).parse(参数)
      return {
        ...基本,
        语句们: [
          获得引擎(name),
          `${选项.需要结果 ? 'let selected = ' : ''}await 引擎.选择(${生成目标(target)}, ${字面量(values)}, { timeout: ${String(推算回放超时(条目))} })`,
          ...保存结果(条目, 选项, '{ selected }'),
        ],
      }
    }
    case 'browser_wait': {
      let { name, target, state } = 目标操作模型.extend({ state: z.enum(['visible', 'hidden']) }).parse(参数)
      return {
        ...基本,
        类型: '观察',
        语句们: [
          获得引擎(name),
          `await 引擎.${state === 'visible' ? '验证可见' : '验证隐藏'}(${生成目标(target)}, { timeout: ${String(推算回放超时(条目))} })`,
          ...保存结果(条目, 选项, `{ state: ${字面量(state)} }`),
        ],
      }
    }
    case 'browser_inspect_target': {
      let { name, target } = 目标操作模型.parse(参数)
      let 调用 = `await 引擎.检查目标(${生成目标(target)}, { timeout: ${String(推算回放超时(条目))} })`
      return {
        ...基本,
        类型: '观察',
        语句们: [
          获得引擎(name),
          ...(选项.需要结果
            ? [
                `let { 匹配数量, 可见, 可用 } = ${调用}`,
                ...保存结果(
                  条目,
                  选项,
                  '{ count: 匹配数量, ...(可见 === undefined ? {} : { visible: 可见 }), ...(可用 === undefined ? {} : { enabled: 可用 }) }',
                ),
              ]
            : [调用]),
        ],
      }
    }
  }
  return undefined
}

function 生成数据库参数代码(参数们: readonly 数据库参数[]): string {
  let 参数列表 = 参数们.map((值): string => {
    if (值 === null) return 'null'
    if (typeof 值 !== 'object') return JSON.stringify(值)
    switch (值.type) {
      case 'bigint':
        return `BigInt(${字面量(值.value)})`
      case 'blob':
        return `Buffer.from(${字面量(值.value)}, 'base64')`
    }
  })
  return `[${参数列表.join(', ')}]`
}

/** 回放执行的写入与录制时执行的完全一样：同一条 SQL，同一组解码后的参数。 */
function 生成数据库写入(条目: 操作调用条目, 选项: 生成选项): 生成结果 {
  let { sql, parameters } = 写入模型.parse(条目.arguments)
  let 写入 = `当前状态.工具.数据库.执行(${字面量(sql)}, ${生成数据库参数代码(parameters)})`
  if (选项.需要结果)
    return {
      名称: 生成名称(条目),
      类型: '行为',
      语句们: 保存结果(条目, 选项, `整理数据库写入结果(${写入})`),
      需要写入结果工具: true,
    }
  return { 名称: 生成名称(条目), 类型: '行为', 语句们: [写入] }
}

function 生成数据库操作(条目: 操作调用条目, 选项: 生成选项): 生成结果 {
  let { sql, parameters, maxRows, evidenceColumns } = 查询模型.parse(条目.arguments)
  let 报告列 = evidenceColumns === undefined ? '' : `, ${字面量(evidenceColumns)}`
  let 查询 = `当前状态.工具.数据库.查询(${字面量(sql)}, ${生成数据库参数代码(parameters)}${报告列})`
  if (选项.需要结果)
    return {
      名称: 生成名称(条目),
      类型: '观察',
      语句们: 保存结果(条目, 选项, `整理数据库查询结果(${查询}${maxRows === undefined ? '' : `, ${String(maxRows)}`})`),
      需要查询结果工具: true,
    }
  return { 名称: 生成名称(条目), 类型: '观察', 语句们: [查询] }
}

function 生成原始调用代码(条目: 操作调用条目, 选项: 生成选项): 生成结果 {
  try {
    if (条目.status === 'pending') throw new Error('不能转换尚未完成的调用')
    if (条目.tool.startsWith('browser_') || 条目.tool.startsWith('android_')) {
      let { observe, ...业务参数 } = 条目.arguments
      浏览器观察参数模型.shape.observe.parse(observe)
      if (条目.tool.startsWith('browser_')) {
        let { observation, ...原业务参数 } = 业务参数
        z.enum(['instant', 'stable', 'none']).optional().parse(observation)
        业务参数 = 原业务参数
      }
      条目 = { ...条目, arguments: 业务参数 }
    }
    let 安卓代码 = 生成安卓调用代码(条目, 选项.需要结果, 选项.流程文件名前缀)
    let 请求代码 = 生成请求调用代码(条目, 选项.需要结果)
    if (请求代码 !== undefined) return 请求代码
    if (安卓代码 !== undefined) return 安卓代码
    let 苹果代码 = 生成苹果调用代码(条目, 选项.需要结果, 选项.流程文件名前缀)
    if (苹果代码 !== undefined) return 苹果代码
    if (条目.tool === 'database_query') return 生成数据库操作(条目, 选项)
    if (条目.tool === 'database_execute') return 生成数据库写入(条目, 选项)
    if (条目.tool === 'http_request') {
      let 参数 = HTTP请求模型.parse(条目.arguments)
      let 请求 = `await 当前状态.工具.HTTP.请求(${JSON.stringify(参数)})`
      return {
        名称: 生成名称(条目),
        类型: 参数.method === 'GET' ? '观察' : '行为',
        语句们: 选项.需要结果 ? 保存结果(条目, 选项, 请求) : [请求],
        异步: true,
      }
    }
    let 结果 = 生成页面操作(条目, 选项) ?? 生成目标操作(条目, 选项)
    if (结果 === undefined) throw new Error(`不支持转换工具 ${条目.tool}`)
    return 条目.tool === 'browser_list' ? 结果 : { ...结果, 异步: true }
  } catch (错误) {
    let 原因 = 错误 instanceof Error ? 错误.message : String(错误)
    throw new Error(`操作 ${String(条目.id)} 转换失败：${原因}`, { cause: 错误 })
  }
}

function 获得引擎种类(工具: string): 引擎种类 | undefined {
  if (工具.startsWith('ios_')) return '苹果'
  if (工具.startsWith('android_')) return '安卓'
  if (工具.startsWith('browser_')) return '浏览器'
  return undefined
}

/**
 * 把一条操作记录转成回放代码。录制时自动识别出的信息在这里生效：
 * 坐标点击导出成按元素点击或等图片后点击（见各引擎的生成函数），动作前后页面地址变了就在动作后加等地址。
 */
export function 生成调用代码(条目: 操作调用条目, 选项: 生成选项): 生成结果 {
  let 结果 = 生成原始调用代码(条目, 选项)
  let 引擎 = 获得引擎种类(条目.tool)
  if (引擎 === undefined) return 结果
  let 等地址 = 生成等地址语句(条目, 引擎)
  return 等地址.length === 0 ? 结果 : { ...结果, 语句们: [...结果.语句们, ...等地址] }
}
