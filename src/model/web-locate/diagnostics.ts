/**
 * 网页点击诊断：点之前记下点击坐标处最上层元素、定位歧义时给出推荐定位、失败时取网页可见文字。
 * 页面里执行的脚本三端共用（iOS 经 Appium 的 executeScript，Android 和浏览器经 Playwright 的 evaluate，写法见 scripts.ts），
 * 这里同时放纯函数的格式化逻辑，方便单元测试。只做诊断，不改变点击行为。
 */

/** 页面里描述一个元素的原始信息（值为 undefined 的字段在 iOS 上会变成 null，用时按没有处理）。 */
export type 点中元素 = {
  标签: string
  角色?: string | null | undefined
  名称?: string | null | undefined
  aria标签?: string | null | undefined
  文字?: string | null | undefined
  类名?: string | null | undefined
  /** 命中元素本身不可交互时，上面的字段描述往上找到的可交互祖先，这里是实际命中的那个元素（如按钮里的 svg）。 */
  内含?: Omit<点中元素, '内含'> | null | undefined
}

/**
 * 页面里的描述函数：描述节点(元素) 返回 点中元素 的形状；取点中元素(x, y) 穿透 Shadow DOM 取坐标处最上层元素。
 * 用独一无二的函数名，可以和别的脚本拼在一起而不冲突。
 */
export let 共用描述脚本 = `
  let 描述节点 = (元素) => {
    let 清理 = (值) => String(值 || '').replace(/\\s+/g, ' ').trim()
    let 取字 = (节点) => {
      let 结果 = ''
      let 子们 = [...节点.childNodes]
      if (节点.shadowRoot) 子们.push(...节点.shadowRoot.childNodes)
      for (let 子 of 子们) 结果 += 子.nodeType === 3 ? 子.data : 子.nodeType === 1 ? 取字(子) : ''
      return 结果
    }
    let 标签 = 元素.tagName.toLowerCase()
    let 显式角色 = 元素.getAttribute('role')
    let 角色 = 显式角色 || ''
    if (角色 === '') {
      if (标签 === 'button') 角色 = 'button'
      else if (标签 === 'a' && 元素.hasAttribute('href')) 角色 = 'link'
      else if (标签 === 'input') 角色 = ['checkbox', 'radio'].includes(元素.type) ? 元素.type : ['button', 'submit', 'reset'].includes(元素.type) ? 'button' : 'textbox'
      else if (标签 === 'textarea') 角色 = 'textbox'
      else if (标签 === 'select') 角色 = 'combobox'
      else if (标签 === 'img') 角色 = 'img'
      else if (/^h[1-6]$/.test(标签)) 角色 = 'heading'
    }
    let aria标签 = 清理(元素.getAttribute('aria-label'))
    let 文字 = 清理(取字(元素)).slice(0, 41)
    let 名称 = aria标签 || 清理(元素.getAttribute('alt')) || 清理(元素.getAttribute('title')) || 清理(元素.getAttribute('placeholder')) || 文字
    let 类名 = 清理(typeof 元素.className === 'string' ? 元素.className : 元素.getAttribute('class'))
    return JSON.parse(JSON.stringify({ 标签, 角色: 角色 || undefined, 名称: 名称 || undefined, aria标签: aria标签 || undefined, 文字: 文字 || undefined, 类名: 类名 || undefined }))
  }
  let 取点中元素 = (x, y) => {
    let 命中 = document.elementFromPoint(x, y)
    while (命中 !== null && 命中.shadowRoot) {
      let 内层 = 命中.shadowRoot.elementFromPoint(x, y)
      if (内层 === null || 内层 === 命中) break
      命中 = 内层
    }
    return 命中
  }
  let 上一层元素 = (节点) => {
    if (节点.parentElement) return 节点.parentElement
    let 根 = 节点.getRootNode()
    return 根 && 根.host ? 根.host : null
  }
  let 是交互元素 = (元素) => {
    let 标签 = 元素.tagName.toLowerCase()
    if (['button', 'select', 'textarea', 'label', 'summary'].includes(标签)) return true
    if (标签 === 'input') return 元素.type !== 'hidden'
    if (标签 === 'a' && 元素.hasAttribute('href')) return true
    return String(元素.getAttribute('role') || '').trim() !== '' || String(元素.getAttribute('aria-label') || '').trim() !== ''
  }
  // 点击点描述：命中元素本身不可交互（比如按钮里的图标）时，往上（含穿出 shadow host）找最近的可交互元素，内含 记录实际命中的元素
  let 描述点击点 = (命中) => {
    let 目标 = 命中
    while (目标 !== null && 是交互元素(目标) === false) 目标 = 上一层元素(目标)
    if (目标 === null || 目标 === 命中) return 描述节点(命中)
    return { ...描述节点(目标), 内含: 描述节点(命中) }
  }
`

/** 参数：页面（CSS 视口）坐标 x、y。返回坐标处最上层元素的描述，坐标在页面之外或没有元素返回 null。 */
export let 点中元素脚本 = `
  ${共用描述脚本}
  let 命中 = 取点中元素(arguments[0], arguments[1])
  return 命中 === null ? null : 描述点击点(命中)
`

/**
 * 失败现场用：页面可见文字。被测 App 的内容多在 Shadow DOM 里，document.body.innerText 穿不进去，
 * 这里递归遍历（含开放的 shadowRoot，slot 取分配到的节点），跳过 display:none、visibility:hidden 和 script、style 等；
 * 块级元素前后换行。字数多了提前停止，最终截断由 整理网页可见文字 负责。
 */
export let 网页可见文字脚本 = `
  let 片段们 = []
  let 字数 = 0
  let 上限 = 8000
  let 走 = (节点) => {
    if (字数 > 上限) return
    if (节点.nodeType === 3) {
      片段们.push(节点.data)
      字数 += 节点.data.length
      return
    }
    let 是元素 = 节点.nodeType === 1
    let 块级 = false
    if (是元素) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD'].includes(节点.tagName)) return
      let 样式 = getComputedStyle(节点)
      if (样式.display === 'none' || 样式.visibility === 'hidden') return
      块级 = 样式.display !== 'inline' && 样式.display !== 'contents'
    } else if (节点.nodeType !== 11 && 节点.nodeType !== 9) {
      return
    }
    if (块级) 片段们.push('\\n')
    let 子们 = 是元素 && 节点.shadowRoot ? [...节点.shadowRoot.childNodes] : [...节点.childNodes]
    if (是元素 && 节点.tagName === 'SLOT' && 节点.shadowRoot === null) {
      let 分配 = typeof 节点.assignedNodes === 'function' ? 节点.assignedNodes({ flatten: true }) : []
      if (分配.length > 0) 子们 = 分配
    }
    for (let 子 of 子们) 走(子)
    if (块级) 片段们.push('\\n')
  }
  走(document.body || document.documentElement)
  return 片段们.join('')
`

export let 网页文字最大字数 = 3000

/** 压缩空行、截断到 3000 字，附上被截断说明。 */
export function 整理网页可见文字(原文: string, 最大字数 = 网页文字最大字数): string {
  let 整理 = 原文
    .replace(/[ \t]+/gu, ' ')
    .replace(/\s*\n\s*/gu, '\n')
    .trim()
  return 整理.length > 最大字数 ? `${整理.slice(0, 最大字数)}\n...（已截断，原文共 ${String(整理.length)} 字）` : 整理
}

function 简短类名(类名: string | null | undefined): string {
  let 类们 = (类名 ?? '').split(/\s+/u).filter((类) => 类 !== '')
  let 文本 = 类们.slice(0, 3).join(' ')
  return 文本.length > 60 ? `${文本.slice(0, 57)}...` : 文本
}

function 格式化单个元素(元素: Omit<点中元素, '内含'>, 带文字: boolean): string {
  let 属性们: string[] = [元素.标签.toLowerCase()]
  if (元素.aria标签 !== null && 元素.aria标签 !== undefined && 元素.aria标签 !== '')
    属性们.push(`aria-label="${元素.aria标签}"`)
  let 类名 = 简短类名(元素.类名)
  if (类名 !== '') 属性们.push(`class="${类名}"`)
  let 文字 = (元素.文字 ?? '').trim()
  let 文字部分 =
    带文字 === false || 文字 === '' || 文字 === 元素.aria标签
      ? ''
      : `「${文字.length > 20 ? `${文字.slice(0, 20)}...` : 文字}」`
  return `<${属性们.join(' ')}>${文字部分}`
}

/**
 * `<button aria-label="返回" class="nav-back icon">「返回」`：标签、aria-label、类名摘要和可见文字。
 * 命中的是可交互元素里面的子元素（如按钮里的图标）时写成 `<button aria-label="Announcements"> 里的 <svg>`。
 */
export function 格式化点中元素(元素: 点中元素 | null | undefined): string {
  if (元素 === null || 元素 === undefined) return '页面之外（该坐标没有页面元素）'
  if (元素.内含 === null || 元素.内含 === undefined) return 格式化单个元素(元素, true)
  return `${格式化单个元素(元素, false)} 里的 ${格式化单个元素(元素.内含, false)}`
}

/** 记住最近一次网页点击点中了什么，等待或断言超时时拼进错误信息。 */
export class 点击现场记录 {
  private 现场: { 描述: string; 时间: number } | undefined

  public 记录(描述: string, 现在 = Date.now()): void {
    this.现场 = { 描述, 时间: 现在 }
  }

  public 获得(): string | undefined {
    return this.现场?.描述
  }

  /** 执行等待或断言，失败时抛出带「上一次点击实际点中」的错误。 */
  public async 包裹<T>(执行: () => Promise<T>): Promise<T> {
    try {
      return await 执行()
    } catch (错误) {
      throw this.附加到错误(错误)
    }
  }

  /** 有记录时返回带「上一次点击实际点中」的新错误，没有记录原样返回。 */
  public 附加到错误(错误: unknown, 现在 = Date.now()): unknown {
    if (this.现场 === undefined || 错误 instanceof Error === false) return 错误
    if (错误.name === 'AbortError') return 错误
    let 秒 = Math.max(0, Math.round((现在 - this.现场.时间) / 1000))
    return new Error(`${错误.message}\n上一次点击实际点中：${this.现场.描述}（${String(秒)} 秒前）`, { cause: 错误 })
  }
}

export type 歧义匹配 = {
  序号: number
  标签: string
  角色?: string | null | undefined
  名称?: string | null | undefined
  aria标签?: string | null | undefined
  文字?: string | null | undefined
  类名?: string | null | undefined
  /** 页面里按 role+name 精确查找只有它一个（核对过才填）。 */
  角色名称唯一?: boolean | null | undefined
  /** 页面里 标签[aria-label="…"] 只匹配它一个（核对过才填）。 */
  选择器唯一?: boolean | null | undefined
}

function 有空白(值: string | null | undefined): 值 is string {
  return 值 !== null && 值 !== undefined && 值.trim() !== ''
}

function 转义(值: string): string {
  return 值.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

/**
 * 「匹配多个」时给下一步用的建议：每个匹配项列出 role+name、aria-label 选择器和带序号写法。
 * `总数` 比 `匹配们` 多时说明只列了前几个。`序号写法` 是原定位后追加序号的说明，由调用方按目标种类给。
 */
export function 格式化歧义建议(
  匹配们: readonly 歧义匹配[],
  选项: { 总数: number; 序号写法: string; 含角色写法?: boolean },
): string {
  let 行们 = 匹配们.map((匹配) => {
    // 只推荐核对过页面里真的只匹配一个的写法，不唯一的不列，照抄仍是歧义
    let 推荐: string[] = []
    if (选项.含角色写法 !== false && 匹配.角色名称唯一 === true && 有空白(匹配.角色) && 有空白(匹配.名称))
      推荐.push(`role=${匹配.角色} name="${转义(匹配.名称.slice(0, 40))}"`)
    if (匹配.选择器唯一 === true && 有空白(匹配.aria标签))
      推荐.push(`选择器 ${匹配.标签.toLowerCase()}[aria-label="${转义(匹配.aria标签)}"]`)
    推荐.push(选项.序号写法.replace('{序号}', String(匹配.序号)))
    return `  #${String(匹配.序号)} ${格式化点中元素({ ...匹配 })} → 推荐：${推荐.join('；或 ')}`
  })
  let 省略 = 选项.总数 > 匹配们.length ? `\n  （共 ${String(选项.总数)} 个，只列前 ${String(匹配们.length)} 个）` : ''
  return `各匹配项的推荐定位（序号从 0 开始）：\n${行们.join('\n')}${省略}`
}

export type 原生匹配 = { 序号: number; 类型: string; 文字: string; 名称: string; 标识: string }

/** 原生元素匹配多个时的建议：列出各项的文字、描述、标识（Android 叫资源ID），指出哪种定位能区分。 */
export function 格式化原生歧义建议(匹配们: readonly 原生匹配[], 总数: number, 标识叫法 = '标识'): string {
  let 行们 = 匹配们.map(
    (匹配) =>
      `  #${String(匹配.序号)} ${匹配.类型} 文字=${JSON.stringify(匹配.文字)} 描述=${JSON.stringify(匹配.名称)} ${标识叫法}=${JSON.stringify(匹配.标识)}`,
  )
  let 能区分 = (取值: (匹配: 原生匹配) => string): boolean => {
    let 值们 = 匹配们.map(取值)
    return 值们.every((值) => 值 !== '') && new Set(值们).size === 值们.length
  }
  let 方法 = 能区分((匹配) => 匹配.标识)
    ? `按「${标识叫法}」定位可以区分`
    : 能区分((匹配) => 匹配.名称)
      ? '按「描述」定位可以区分'
      : 能区分((匹配) => 匹配.文字)
        ? '按「文字」定位可以区分'
        : `文字、描述、${标识叫法}都不能区分，请给元素设不同的${标识叫法 === '标识' ? ' accessibilityIdentifier' : '资源 ID 或 content-description'}，或改用网页定位`
  let 省略 = 总数 > 匹配们.length ? `\n  （共 ${String(总数)} 个，只列前 ${String(匹配们.length)} 个）` : ''
  return `各匹配项（原生界面树没有序号写法）：\n${行们.join('\n')}${省略}\n${方法}`
}
