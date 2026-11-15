/** 定位脚本和落点验证脚本共用的查询函数：只支持空格、> 组合符和末尾一个 :has-text("文字")，穿透开放的 Shadow DOM。 */
export let 共用查询脚本 = `
  let 归一 = (文本) => String(文本).replace(/\\s+/g, ' ').trim()
  let 文本 = (节点) => {
    let 结果 = ''
    for (let 子 of node_children(节点)) 结果 += 子.nodeType === 3 ? 子.data : 子.nodeType === 1 ? 文本(子) : ''
    return 结果
  }
  function node_children(节点) {
    let 子们 = [...节点.childNodes]
    if (节点.shadowRoot) 子们.push(...节点.shadowRoot.childNodes)
    return 子们
  }
  let 所有元素 = (根) => {
    let 结果 = []
    let 遍历 = (节点) => {
      for (let 元素 of 节点.querySelectorAll('*')) {
        结果.push(元素)
        if (元素.shadowRoot) 遍历(元素.shadowRoot)
      }
    }
    遍历(根)
    return 结果
  }
  let 深查 = (节点, 选择器) => {
    let 结果 = [...节点.querySelectorAll(选择器)]
    let 宿主们 = 节点.shadowRoot ? [节点] : []
    for (let 元素 of 节点.querySelectorAll('*')) if (元素.shadowRoot) 宿主们.push(元素)
    for (let 宿主 of 宿主们) 结果.push(...深查(宿主.shadowRoot, 选择器))
    return 结果
  }
  let 拆分 = (选择器) => {
    let 部分们 = []
    let 当前 = ''
    let 方括号 = 0, 圆括号 = 0, 引号 = ''
    for (let 字符 of 选择器.trim()) {
      if (引号 !== '') { 当前 += 字符; if (字符 === 引号) 引号 = ''; continue }
      if (字符 === '"' || 字符 === "'") { 引号 = 字符; 当前 += 字符; continue }
      if (字符 === '[') 方括号++
      if (字符 === ']') 方括号--
      if (字符 === '(') 圆括号++
      if (字符 === ')') 圆括号--
      if (方括号 === 0 && 圆括号 === 0 && /\\s/.test(字符)) { if (当前 !== '') 部分们.push(当前); 当前 = ''; continue }
      当前 += 字符
    }
    if (当前 !== '') 部分们.push(当前)
    return 部分们
  }
  let 查询 = (选择器) => {
    let 过滤文字
    let 匹配 = /^(.*):has-text\\((["'])(.*)\\2\\)\\s*$/s.exec(选择器)
    if (匹配 !== null) {
      选择器 = 匹配[1].trim() === '' ? '*' : 匹配[1]
      过滤文字 = 匹配[3].toLowerCase()
    }
    if (选择器.includes(':has-text(')) throw new Error('只支持选择器末尾的 :has-text("文字")')
    let 当前 = [document]
    let 子代 = false
    for (let 部分 of 拆分(选择器)) {
      if (部分 === '>') { 子代 = true; continue }
      let 下一批 = []
      for (let 节点 of 当前) {
        if (子代) 下一批.push(...[...(节点.children || [])].filter((元素) => 元素.matches(部分)))
        else 下一批.push(...深查(节点, 部分))
      }
      当前 = [...new Set(下一批)]
      子代 = false
    }
    return 过滤文字 === undefined ? 当前 : 当前.filter((元素) => 文本(元素).toLowerCase().includes(过滤文字))
  }
  let 按种类查 = (种类, 值) => {
    if (种类 === 'text') {
      let 目标 = 归一(值)
      return 所有元素(document).filter(
        (元素) =>
          ['SCRIPT', 'STYLE'].includes(元素.tagName) === false &&
          归一(文本(元素)) === 目标 &&
          [...元素.children].some((子) => 归一(文本(子)) === 目标) === false,
      )
    }
    return 查询(值)
  }
`

/**
 * 在 WKWebView 页面里定位元素的脚本，对应安卓引擎用 Playwright 做的定位。
 * 参数：按（'text' 或 'css'）、值、是否把元素滚到屏幕中央并检查能收到点击（可见、中心点没被遮挡、未禁用）。
 * 与 Playwright 一样穿透开放的 Shadow DOM；选择器支持空格、> 组合符，以及末尾一个 :has-text("文字")。
 */
export let 定位脚本 = `
  let 种类 = arguments[0], 值 = arguments[1], 要点击 = arguments[2]
  ${共用查询脚本}
  let 元素们 = 按种类查(种类, 值)
  let 可见的 = (元素) => {
    let 范围 = 元素.getBoundingClientRect()
    return 范围.width > 0 && 范围.height > 0 && getComputedStyle(元素).visibility !== 'hidden'
  }
  let 包含 = (祖先, 后代) => {
    for (let 节点 = 后代; 节点 !== null && 节点 !== undefined; 节点 = 节点.parentNode || 节点.host) if (节点 === 祖先) return true
    return false
  }
  let 结果 = { 数量: 元素们.length, 可见数量: 元素们.filter(可见的).length, 可点击: false, 禁用: false, 元素宽: 0, 元素高: 0, x: 0, y: 0, 宽: window.innerWidth, 高: window.innerHeight }
  if (要点击 && 元素们.length === 1 && 可见的(元素们[0])) {
    let 元素 = 元素们[0]
    元素.scrollIntoView({ block: 'center', inline: 'center' })
    let 范围 = 元素.getBoundingClientRect()
    let x = 范围.left + 范围.width / 2
    let y = 范围.top + 范围.height / 2
    let 命中 = null
    if (x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight) {
      命中 = document.elementFromPoint(x, y)
      while (命中 !== null && 命中.shadowRoot) {
        let 内层 = 命中.shadowRoot.elementFromPoint(x, y)
        if (内层 === null || 内层 === 命中) break
        命中 = 内层
      }
    }
    结果.禁用 = 元素.matches(':disabled') || 元素.getAttribute('aria-disabled') === 'true'
    // 中心点命中的必须是元素自己或它的后代（穿透 shadow），被别的元素盖住就不算可点击；禁用的元素也不能点
    结果.可点击 = 命中 !== null && 包含(元素, 命中) && 结果.禁用 === false
    结果.x = x
    结果.y = y
    结果.元素宽 = 范围.width
    结果.元素高 = 范围.height
  }
  return 结果
`

/**
 * 生成 WebView 的精简无障碍快照（类似 Playwright 的 ariaSnapshot）：
 * 只列可见的交互控件、标题、地标和有文字的叶子节点，穿透开放的 Shadow DOM，缩进表示层级。
 */
export let 观察网页脚本 = `
  let 最大字数 = 30000
  let 行们 = []
  let 归一 = (文本) => String(文本 || '').replace(/\\s+/g, ' ').trim()
  let 可见 = (元素) => {
    let 范围 = 元素.getBoundingClientRect()
    if (范围.width <= 0 || 范围.height <= 0) return false
    let 样式 = getComputedStyle(元素)
    return 样式.visibility !== 'hidden' && 样式.display !== 'none' && 样式.opacity !== '0'
  }
  let 角色 = (元素) => {
    let 显式 = 元素.getAttribute('role')
    if (显式) return 显式
    let 标签 = 元素.tagName.toLowerCase()
    if (标签 === 'button') return 'button'
    if (标签 === 'a' && 元素.hasAttribute('href')) return 'link'
    if (标签 === 'input') return ['checkbox', 'radio'].includes(元素.type) ? 元素.type : 'textbox'
    if (标签 === 'textarea') return 'textbox'
    if (标签 === 'select') return 'combobox'
    if (标签 === 'img') return 'img'
    if (标签 === 'nav') return 'navigation'
    if (标签 === 'dialog') return 'dialog'
    if (标签 === 'main') return 'main'
    if (/^h[1-6]$/.test(标签)) return 'heading'
    return ''
  }
  let 自身文字 = (元素) => {
    let 结果 = ''
    for (let 子 of 元素.childNodes) if (子.nodeType === 3) 结果 += 子.data
    return 归一(结果)
  }
  let 全部文字 = (元素) => {
    let 结果 = ''
    let 走 = (节点) => {
      for (let 子 of [...节点.childNodes, ...(节点.shadowRoot ? 节点.shadowRoot.childNodes : [])]) {
        if (子.nodeType === 3) 结果 += 子.data + ' '
        else if (子.nodeType === 1 && ['SCRIPT', 'STYLE'].includes(子.tagName) === false) 走(子)
      }
    }
    走(元素)
    return 归一(结果)
  }
  let 属性文字 = (元素) => {
    let 部分们 = []
    if (元素.getAttribute('aria-current')) 部分们.push('[current=' + 元素.getAttribute('aria-current') + ']')
    if (元素.disabled === true || 元素.getAttribute('aria-disabled') === 'true') 部分们.push('[disabled]')
    if (元素.checked === true || 元素.getAttribute('aria-checked') === 'true') 部分们.push('[checked]')
    if (元素.getAttribute('aria-expanded')) 部分们.push('[expanded=' + 元素.getAttribute('aria-expanded') + ']')
    return 部分们.length > 0 ? ' ' + 部分们.join(' ') : ''
  }
  let 引号 = (文本) => JSON.stringify(文本.length > 120 ? 文本.slice(0, 117) + '...' : 文本)
  let 走 = (节点, 深度) => {
    for (let 元素 of [...节点.children]) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(元素.tagName)) continue
      if (元素.getAttribute('aria-hidden') === 'true' || 可见(元素) === false) {
        if (元素.shadowRoot === null || 元素.getAttribute('aria-hidden') === 'true') continue
      }
      let 身份 = 角色(元素)
      let 名称 = 归一(元素.getAttribute('aria-label') || 元素.getAttribute('alt') || 元素.getAttribute('title') || 元素.getAttribute('placeholder'))
      let 文字 = 自身文字(元素)
      let 缩进 = '  '.repeat(深度)
      let 子深度 = 深度
      if (身份 !== '') {
        let 叶子 = ['button', 'link', 'heading', 'img', 'textbox', 'checkbox', 'radio', 'combobox'].includes(身份)
        let 显示名 = 名称 !== '' ? 名称 : 叶子 ? 全部文字(元素) : ''
        let 值 = 'value' in 元素 && 元素.value !== undefined && ['textbox', 'combobox'].includes(身份) ? ' value=' + 引号(String(元素.value)) : ''
        行们.push(缩进 + '- ' + 身份 + (显示名 !== '' ? ' ' + 引号(显示名) : '') + 属性文字(元素) + 值)
        子深度 = 深度 + 1
        if (['button', 'link', 'heading', 'img', 'textbox', 'checkbox', 'radio', 'combobox'].includes(身份)) {
          // 叶子控件的名称已经包含子孙文字，只继续找嵌套的控件
          for (let 子 of [...元素.children, ...(元素.shadowRoot ? [...元素.shadowRoot.children] : [])])
            if (子.querySelector && 子.querySelector('button, a[href], input, [role]')) 走({ children: [子] }, 子深度)
          continue
        }
      } else if (文字 !== '') {
        行们.push(缩进 + '- text ' + 引号(文字))
      }
      if (元素.shadowRoot) 走(元素.shadowRoot, 子深度)
      走(元素, 子深度)
    }
  }
  走(document.body, 0)
  let 文本 = 行们.join('\\n')
  return 文本.length > 最大字数 ? 文本.slice(0, 最大字数) + '\\n...（已截断）' : 文本
`

/**
 * 坐标点击落点识别的验证脚本：参数是候选数组（种类 '选择器' | '文字'，值），
 * 用与 定位脚本 完全相同的查询逻辑，返回第一个「只匹配到一个，而且就是 window.__ntProbeTarget」的候选序号，没有返回 -1。
 * 文字候选匹配到的是含该文字的最深元素，允许是落点元素的后代。
 */
export let 落点验证脚本 = `
  let 候选们 = arguments[0]
  ${共用查询脚本}
  let 目标 = window.__ntProbeTarget
  let 包含 = (祖先, 后代) => {
    for (let 节点 = 后代; 节点 !== null && 节点 !== undefined; 节点 = 节点.parentNode || 节点.host) if (节点 === 祖先) return true
    return false
  }
  for (let 序号 = 0; 序号 < 候选们.length; 序号++) {
    try {
      let 元素们 = 按种类查(候选们[序号].种类 === '文字' ? 'text' : 'css', 候选们[序号].值)
      if (元素们.length !== 1) continue
      if (候选们[序号].种类 === '选择器' ? 元素们[0] === 目标 : 包含(目标, 元素们[0])) return 序号
    } catch (错误) {
      // 写法不被 iOS 引擎支持的候选跳过
    }
  }
  return -1
`
