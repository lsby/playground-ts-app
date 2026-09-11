import { 增强样式类型 } from '../types/style'

type 子元素类型 =
  | HTMLElement
  | SVGElement
  | DocumentFragment
  | string
  | number
  | boolean
  | null
  | undefined
  | 子元素类型[]

type 元素属性 = { style?: 增强样式类型; children?: 子元素类型 }

function 添加子元素(父元素: HTMLElement, 子元素: 子元素类型): void {
  if (子元素 === null || 子元素 === undefined || typeof 子元素 === 'boolean') {
    return
  }
  if (Array.isArray(子元素)) {
    for (let 子 of 子元素) {
      添加子元素(父元素, 子)
    }
    return
  }
  if (typeof 子元素 === 'string' || typeof 子元素 === 'number') {
    父元素.appendChild(document.createTextNode(String(子元素)))
    return
  }
  if (子元素 instanceof DocumentFragment) {
    父元素.appendChild(子元素)
    return
  }
  if (子元素 instanceof HTMLElement || 子元素 instanceof SVGElement) {
    父元素.appendChild(子元素)
  }
}

export function 应用样式(元素: HTMLElement, 样式: 增强样式类型): void {
  for (let 键 in 样式) {
    let 值 = 样式[键 as keyof 增强样式类型]
    if (值 !== undefined) 设置样式值(元素.style, 键, String(值))
  }
}

export function 创建元素<K extends keyof HTMLElementTagNameMap>(
  标签: K,
  属性?: 元素属性 & Omit<Partial<HTMLElementTagNameMap[K]>, 'style' | 'children'>,
): HTMLElementTagNameMap[K] {
  let 元素 = document.createElement(标签)

  if (属性 === undefined) return 元素

  let { children, style, ...其他属性 } = 属性

  for (let 键 in 其他属性) {
    let 值 = 其他属性[键 as keyof typeof 其他属性]
    if (值 !== undefined) {
      if (键.includes('-') || 键.includes(':')) {
        元素.setAttribute(键, String(值))
      } else {
        ;(元素 as any)[键] = 值
      }
    }
  }

  if (style !== undefined) {
    应用样式(元素, style)
  }

  if (children !== undefined) {
    添加子元素(元素, children)
  }

  return 元素
}

export function 应用宿主样式(样式对象: CSSStyleDeclaration, 样式?: 增强样式类型): void {
  if (样式 !== undefined) {
    for (let 键 in 样式) {
      let 值 = 样式[键 as keyof 增强样式类型]
      if (值 !== undefined) 设置样式值(样式对象, 键, String(值))
    }
  }
}

function 设置样式值(样式对象: CSSStyleDeclaration, 键: string, 值: string): void {
  let 样式键 = 转换为CSS属性名(键)
  样式对象.setProperty(样式键, 值)
}

function 转换为CSS属性名(键: string): string {
  if (键.startsWith('--')) return 键
  if (键 === 'cssFloat') return 'float'
  let 样式键 = 键.replace(/[A-Z]/g, (字符): string => `-${字符.toLowerCase()}`)
  return /^(webkit|moz|ms|o)-/.test(样式键) ? `-${样式键}` : 样式键
}
