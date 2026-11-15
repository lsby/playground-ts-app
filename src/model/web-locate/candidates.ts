/**
 * 坐标点击的落点识别：把页面里落点元素的描述转成定位候选。
 * 候选只用空格、> 组合符和末尾一个 :has-text("文字")，三端（iOS 自写脚本、Android 与浏览器的 Playwright）都能解析。
 * 这里只做纯函数转换；"唯一且就是这个元素"由各引擎在页面里当场验证。
 */
export type 元素描述 = {
  标签: string
  类名?: string | undefined
  id?: string | undefined
  角色?: string | undefined
  aria标签?: string | undefined
  /** 归一化后的可见文字；页面脚本最多取 41 个字，这里判断是否不超过 20 字。 */
  文字?: string | undefined
  数据属性们?: readonly { 名: string; 值: string }[] | undefined
  /** 最近的带 aria-label 的祖先（穿过 shadow host）。 */
  祖先?: { 标签: string; aria标签: string } | undefined
}
export type 定位种类 = '选择器' | '文字'
export type 定位候选 = { 种类: 定位种类; 值: string; 来源: 'aria-label' | '文字' | '属性' | '祖先' }
export type 落点探测结果 =
  | { 状态: '已识别'; 定位: { 种类: 定位种类; 值: string }; 说明: string }
  | { 状态: '无定位'; 原因: string; 命中: string }

export let 文字最大长度 = 20
let 可点击角色们 = new Set([
  'button',
  'link',
  'tab',
  'checkbox',
  'switch',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'combobox',
  'textbox',
  'searchbox',
  'slider',
  'spinbutton',
  'treeitem',
])
let 角色名称们: Record<string, string> = {
  button: '按钮',
  link: '链接',
  tab: '标签页',
  checkbox: '复选框',
  switch: '开关',
  menuitem: '菜单项',
  option: '选项',
  radio: '单选框',
  textbox: '输入框',
  combobox: '下拉框',
}
let 标签名称们: Record<string, string> = {
  button: '按钮',
  a: '链接',
  input: '输入框',
  select: '下拉框',
  textarea: '输入框',
  label: '标签',
}

export function 是可点击角色(角色: string): boolean {
  return 可点击角色们.has(角色)
}

function 转义属性值(值: string): string {
  return 值.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function 有不支持字符(值: string): boolean {
  // 引号和反斜杠会让 iOS 的选择器拆分与 :has-text 解析出歧义，这类文字不生成候选
  return /["'\\\n\r]/u.test(值)
}

function 是稳定标识(值: string): boolean {
  return /^[A-Za-z][\w-]{0,40}$/u.test(值) && /\d{4,}/u.test(值) === false
}

function 是稳定数据属性(名: string, 值: string): boolean {
  if (/^data-[a-z][a-z0-9-]*$/u.test(名) === false) return false
  // 框架生成的作用域散列（data-v-xxxx）和本框架的临时标记都不稳定
  if (/^data-(v-|nt-)/u.test(名)) return false
  return 值.length > 0 && 值.length <= 60 && 有不支持字符(值) === false && /\d{6,}/u.test(值) === false
}

/** 按优先级列出候选：aria-label、简短文字、稳定属性、祖先 aria-label 组合。 */
export function 生成定位候选(描述: 元素描述): 定位候选[] {
  let 候选们: 定位候选[] = []
  let 标签 = 描述.标签.toLowerCase()
  let 自身标签 = 描述.aria标签?.trim()
  let 文字 = 描述.文字?.trim()
  let 可用文字 =
    文字 !== undefined && 文字 !== '' && 文字.length <= 文字最大长度 && 有不支持字符(文字) === false ? 文字 : undefined
  let 有效自身标签 =
    自身标签 !== undefined && 自身标签 !== '' && 有不支持字符(自身标签) === false ? 自身标签 : undefined
  if (有效自身标签 !== undefined)
    候选们.push({ 种类: '选择器', 值: `${标签}[aria-label="${转义属性值(有效自身标签)}"]`, 来源: 'aria-label' })
  if (可用文字 !== undefined) 候选们.push({ 种类: '文字', 值: 可用文字, 来源: '文字' })
  if (描述.id !== undefined && 是稳定标识(描述.id))
    候选们.push({ 种类: '选择器', 值: `${标签}#${描述.id}`, 来源: '属性' })
  for (let { 名, 值 } of 描述.数据属性们 ?? [])
    if (是稳定数据属性(名, 值)) 候选们.push({ 种类: '选择器', 值: `${标签}[${名}="${转义属性值(值)}"]`, 来源: '属性' })
  let 祖先 = 描述.祖先
  let 祖先标签 = 祖先?.aria标签.trim()
  if (祖先 !== undefined && 祖先标签 !== undefined && 祖先标签 !== '' && 有不支持字符(祖先标签) === false) {
    let 前缀 = `${祖先.标签.toLowerCase()}[aria-label="${转义属性值(祖先标签)}"]`
    if (有效自身标签 !== undefined)
      候选们.push({ 种类: '选择器', 值: `${前缀} ${标签}[aria-label="${转义属性值(有效自身标签)}"]`, 来源: '祖先' })
    if (可用文字 !== undefined)
      候选们.push({ 种类: '选择器', 值: `${前缀} ${标签}:has-text("${可用文字}")`, 来源: '祖先' })
    候选们.push({ 种类: '选择器', 值: `${前缀} ${标签}`, 来源: '祖先' })
  }
  let 已见 = new Set<string>()
  return 候选们.filter((候选) => {
    let 键 = `${候选.种类}\n${候选.值}`
    if (已见.has(键)) return false
    已见.add(键)
    return true
  })
}

/** "按钮「收下礼物」"：给 MCP 返回和建议用的短描述。 */
export function 描述元素(描述: 元素描述): string {
  let 标签 = 描述.标签.toLowerCase()
  let 类型 = (描述.角色 !== undefined ? 角色名称们[描述.角色] : undefined) ?? 标签名称们[标签] ?? '元素'
  let 文字 = 描述.文字?.trim()
  let 名称 =
    描述.aria标签 !== undefined && 描述.aria标签.trim() !== ''
      ? 描述.aria标签.trim()
      : 文字 !== undefined && 文字.length > 0 && 文字.length <= 文字最大长度
        ? 文字
        : undefined
  return 名称 === undefined ? `${类型}<${标签}>` : `${类型}「${名称}」`
}

/** "<div class="a b">"：落点没有可点击元素时，说明点中的是什么。 */
export function 描述命中元素(命中: { 标签: string; 类名?: string | undefined }): string {
  let 类名 = (命中.类名 ?? '').trim().replace(/\s+/gu, ' ')
  let 简短 = 类名.length > 60 ? `${类名.slice(0, 57)}...` : 类名
  return 简短 === '' ? `<${命中.标签.toLowerCase()}>` : `<${命中.标签.toLowerCase()} class="${简短}">`
}

export type 坐标范围 = { 左: number; 上: number; 宽: number; 高: number }
export type 网页视口 = { 宽: number; 高: number }

/**
 * 把操作坐标换算成页面（CSS 视口）坐标。
 * 操作坐标：iOS 是点，Android 是物理像素，浏览器本身就是 CSS 像素。
 * `屏幕范围` 是 WebView 在操作坐标系里的位置和大小（iOS 取 XCUIElementTypeWebView 的 rect，Android 取 uiautomator 里 WebView 的 bounds，浏览器是整个视口），
 * `视口` 是页面的 innerWidth、innerHeight；缩放就是两者之比，已经包含了像素密度。
 * 落在 WebView 之外（原生界面）返回 undefined。
 */
export function 屏幕转网页坐标(
  点: { x: number; y: number },
  屏幕范围: 坐标范围,
  视口: 网页视口,
): { x: number; y: number } | undefined {
  if (屏幕范围.宽 <= 0 || 屏幕范围.高 <= 0 || 视口.宽 <= 0 || 视口.高 <= 0) return undefined
  let 相对x = 点.x - 屏幕范围.左
  let 相对y = 点.y - 屏幕范围.上
  if (相对x < 0 || 相对y < 0 || 相对x >= 屏幕范围.宽 || 相对y >= 屏幕范围.高) return undefined
  return { x: (相对x * 视口.宽) / 屏幕范围.宽, y: (相对y * 视口.高) / 屏幕范围.高 }
}

/**
 * 校验 WebView 范围与页面视口的比例是否一致（宽高缩放相差不超过 3%），不一致说明范围取错了（比如读到了别的控件）。
 */
export function 比例是否一致(屏幕范围: 坐标范围, 视口: 网页视口): boolean {
  if (屏幕范围.宽 <= 0 || 屏幕范围.高 <= 0 || 视口.宽 <= 0 || 视口.高 <= 0) return false
  let 横 = 屏幕范围.宽 / 视口.宽
  let 纵 = 屏幕范围.高 / 视口.高
  return Math.abs(横 - 纵) / Math.max(横, 纵) <= 0.03
}
