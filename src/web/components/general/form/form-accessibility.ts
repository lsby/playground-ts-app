import { 提示管理器 } from '../../../global/manager/hint-manager'
import { 创建元素 } from '../../../global/tools/create-element'

let 表单控件描述序号 = 0
let 表单控件描述元素映射 = new WeakMap<Node, HTMLSpanElement>()

export function 同步表单控件校验状态(
  元素列表: Iterable<HTMLElement>,
  错误: string | null,
  描述文本列表: string[],
): void {
  let 控件列表 = [...元素列表]
  let 首个控件 = 控件列表[0]
  if (首个控件 === undefined) return
  let 根节点 = 首个控件.getRootNode()
  let 描述元素 = 表单控件描述元素映射.get(根节点)
  if (描述元素 === undefined) {
    表单控件描述序号 += 1
    描述元素 = 创建元素('span', {
      id: `lsby-form-control-description-${表单控件描述序号}`,
      style: {
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: '0',
        margin: '-1px',
        overflow: 'hidden',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
        border: '0',
      },
    })
    表单控件描述元素映射.set(根节点, 描述元素)
  }
  let 完整描述列表 = [...描述文本列表, ...(错误 === null ? [] : [错误])].filter((文本): boolean => 文本 !== '')
  描述元素.textContent = 完整描述列表.join('；')
  if (完整描述列表.length > 0 && 描述元素.parentNode !== 根节点) 根节点.appendChild(描述元素)
  if (完整描述列表.length === 0) 描述元素.remove()
  for (let 元素 of 控件列表) {
    元素.setAttribute('aria-invalid', 错误 === null ? 'false' : 'true')
    if (完整描述列表.length === 0) 元素.removeAttribute('aria-describedby')
    else 元素.setAttribute('aria-describedby', 描述元素.id)
  }
}

export function 创建表单帮助按钮(提示内容: string): HTMLButtonElement {
  let 图标 = 创建元素('button', {
    type: 'button',
    textContent: '?',
    title: '查看帮助',
    style: { width: '18px', height: '18px', padding: '0', borderRadius: '50%', fontSize: '11px', cursor: 'help' },
  })
  图标.onmouseenter = (): void => 提示管理器.显示({ 文本: 提示内容 }, 图标)
  图标.onmouseleave = (): void => 提示管理器.隐藏()
  图标.onfocus = (): void => 提示管理器.显示({ 文本: 提示内容 }, 图标)
  图标.onblur = (): void => 提示管理器.隐藏()
  return 图标
}
