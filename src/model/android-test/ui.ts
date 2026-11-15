import { DOMParser, type Element as XML元素 } from '@xmldom/xmldom'

import type { 安卓界面元素 } from './types'

function 读取属性(节点: XML元素, 名称: string): string {
  let 值 = 节点.getAttribute(名称)
  if (值 === null) throw new Error(`Android 界面节点缺少属性：${名称}`)
  return 值
}

function 读取布尔属性(节点: XML元素, 名称: string): boolean {
  let 值 = 读取属性(节点, 名称)
  if (值 !== 'true' && 值 !== 'false') throw new Error(`Android 界面节点的 ${名称} 不是布尔值`)
  return 值 === 'true'
}

function 读取范围(节点: XML元素): 安卓界面元素['范围'] {
  let 范围 = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(读取属性(节点, 'bounds'))
  if (范围 === null) throw new Error('Android 界面节点的 bounds 无效')
  let [, 左, 上, 右, 下] = 范围
  if (左 === undefined || 上 === undefined || 右 === undefined || 下 === undefined)
    throw new Error('Android 界面节点的 bounds 不完整')
  let 结果 = { 左: Number(左), 上: Number(上), 右: Number(右), 下: Number(下) }
  if (Object.values(结果).some((值) => Number.isSafeInteger(值) === false) || 结果.左 > 结果.右 || 结果.上 > 结果.下)
    throw new Error('Android 界面节点的 bounds 越界')
  return 结果
}

export function 解析安卓界面(XML: string): 安卓界面元素[] {
  let 起点 = XML.indexOf('<?xml')
  let 结束标志 = '</hierarchy>'
  let 终点 = XML.lastIndexOf(结束标志)
  if (起点 === -1 || 终点 < 起点) throw new Error('ADB 没有返回完整的 Android 界面 XML')
  let 文档 = new DOMParser({
    onError: (级别, 信息): void => {
      throw new Error(`Android 界面 XML ${级别}：${信息}`)
    },
  }).parseFromString(XML.slice(起点, 终点 + 结束标志.length), 'application/xml')
  if (文档.documentElement?.tagName !== 'hierarchy') throw new Error('Android 界面 XML 根节点无效')
  let 元素们: 安卓界面元素[] = []
  let 节点们 = 文档.getElementsByTagName('node')
  for (let 序号 = 0; 序号 < 节点们.length; 序号 += 1) {
    let 节点 = 节点们.item(序号)
    if (节点 === null) throw new Error('Android 界面节点缺失')
    元素们.push({
      文字: 读取属性(节点, 'text'),
      描述: 读取属性(节点, 'content-desc'),
      资源ID: 读取属性(节点, 'resource-id'),
      包名: 读取属性(节点, 'package'),
      范围: 读取范围(节点),
      可点击: 读取布尔属性(节点, 'clickable'),
      可输入: 读取属性(节点, 'class') === 'android.widget.EditText',
    })
  }
  return 元素们
}

/** 取界面里最大的 android.webkit.WebView 控件的屏幕范围（物理像素），没有时返回 undefined。 */
export function 解析安卓网页控件范围(XML: string): { 左: number; 上: number; 宽: number; 高: number } | undefined {
  let 起点 = XML.indexOf('<?xml')
  let 终点 = XML.lastIndexOf('</hierarchy>')
  if (起点 === -1 || 终点 < 起点) throw new Error('ADB 没有返回完整的 Android 界面 XML')
  let 文档 = new DOMParser({
    onError: (级别, 信息): void => {
      throw new Error(`Android 界面 XML ${级别}：${信息}`)
    },
  }).parseFromString(XML.slice(起点, 终点 + '</hierarchy>'.length), 'application/xml')
  let 最大: { 左: number; 上: number; 宽: number; 高: number } | undefined
  let 节点们 = 文档.getElementsByTagName('node')
  for (let 序号 = 0; 序号 < 节点们.length; 序号 += 1) {
    let 节点 = 节点们.item(序号)
    if (节点 === null || 节点.getAttribute('class') !== 'android.webkit.WebView') continue
    let 范围 = 读取范围(节点)
    let 宽 = 范围.右 - 范围.左
    let 高 = 范围.下 - 范围.上
    if (宽 > 0 && 高 > 0 && (最大 === undefined || 宽 * 高 > 最大.宽 * 最大.高))
      最大 = { 左: 范围.左, 上: 范围.上, 宽, 高 }
  }
  return 最大
}
