/**
 * 坐标点击落点识别要在页面里执行的脚本。三端共用同一份：
 * iOS 经 Appium 的 executeScript 执行（函数体，参数在 arguments 里），Android 和浏览器经 Playwright 的 evaluate 执行（见 playwright.ts）。
 */
export let 读取视口脚本 = `
  return { 宽: window.innerWidth, 高: window.innerHeight }
`

/**
 * 参数：页面（CSS 视口）坐标 x、y。
 * 返回落点最深处的元素（穿透 Shadow DOM：在每层 shadowRoot 上继续调用 elementFromPoint），
 * 以及从落点往上（跨过 shadow host）找到的最近的可点击元素的描述。
 * 找到的可点击元素临时存在 window.__ntProbeTarget，供后续验证候选是否唯一指向它，验证完要用清理脚本放掉。
 */
export let 落点脚本 = `
  let x = arguments[0], y = arguments[1]
  let 归一 = (文本) => String(文本 || '').replace(/\\s+/g, ' ').trim()
  let 文本 = (节点) => {
    let 结果 = ''
    let 子们 = [...节点.childNodes]
    if (节点.shadowRoot) 子们.push(...节点.shadowRoot.childNodes)
    for (let 子 of 子们) 结果 += 子.nodeType === 3 ? 子.data : 子.nodeType === 1 ? 文本(子) : ''
    return 结果
  }
  let 命中 = document.elementFromPoint(x, y)
  while (命中 !== null && 命中.shadowRoot) {
    let 内层 = 命中.shadowRoot.elementFromPoint(x, y)
    if (内层 === null || 内层 === 命中) break
    命中 = 内层
  }
  let 上一层 = (节点) => {
    if (节点.parentElement) return 节点.parentElement
    let 根 = 节点.getRootNode()
    return 根 && 根.host ? 根.host : null
  }
  let 可点击角色 = ['button', 'link', 'tab', 'checkbox', 'switch', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'combobox', 'textbox', 'searchbox', 'slider', 'spinbutton', 'treeitem']
  let 视口面积 = window.innerWidth * window.innerHeight
  let 是可点击 = (元素) => {
    let 标签 = 元素.tagName.toLowerCase()
    if (['button', 'select', 'textarea', 'label'].includes(标签)) return true
    if (标签 === 'input') return 元素.type !== 'hidden'
    if (标签 === 'a' && 元素.hasAttribute('href')) return true
    if (可点击角色.includes(元素.getAttribute('role') || '')) return true
    if (归一(元素.getAttribute('aria-label')) !== '') {
      // 只靠 aria-label 算可点击的元素，如果大到占了大半个屏幕，多半是容器，点它中心不等于点落点，不采用
      let 范围 = 元素.getBoundingClientRect()
      return 范围.width * 范围.height <= 视口面积 * 0.4
    }
    return false
  }
  let 结果 = { 命中: null, 目标: null }
  if (命中 === null) return 结果
  结果.命中 = { 标签: 命中.tagName.toLowerCase(), 类名: typeof 命中.className === 'string' ? 命中.className : (命中.getAttribute('class') || '') }
  let 目标 = 命中
  while (目标 !== null && 是可点击(目标) === false) 目标 = 上一层(目标)
  if (目标 === null) return 结果
  let 祖先 = 上一层(目标)
  while (祖先 !== null && 归一(祖先.getAttribute('aria-label')) === '') 祖先 = 上一层(祖先)
  window.__ntProbeTarget = 目标
  let 描述 = {
    标签: 目标.tagName.toLowerCase(),
    类名: typeof 目标.className === 'string' ? 目标.className : (目标.getAttribute('class') || ''),
    id: 目标.id || undefined,
    角色: 目标.getAttribute('role') || undefined,
    aria标签: 归一(目标.getAttribute('aria-label')) || undefined,
    文字: 归一(文本(目标)).slice(0, 41) || undefined,
    数据属性们: [...目标.attributes].filter((属性) => 属性.name.startsWith('data-')).map((属性) => ({ 名: 属性.name, 值: 属性.value })),
    祖先: 祖先 === null ? undefined : { 标签: 祖先.tagName.toLowerCase(), aria标签: 归一(祖先.getAttribute('aria-label')) },
  }
  // 去掉值为 undefined 的字段：iOS 的 WebDriver 会把它们变成 null
  结果.目标 = JSON.parse(JSON.stringify(描述))
  return 结果
`

export let 清理脚本 = `
  window.__ntProbeTarget = null
  return true
`
