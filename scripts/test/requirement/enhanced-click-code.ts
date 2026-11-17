import { 规范地址 } from '../../../src/model/web-locate/page-url'
import type { 操作调用条目 } from '../../../src/test-tools/operation-record'

import { 推算回放超时 } from './operation-timeout'
export type 引擎种类 = '苹果' | '安卓' | '浏览器'
export type 模板资源 = { 操作编号: number; 来源路径: string; 相对路径: string }
export type 增强点击代码 = { 语句们: string[]; 模板资源?: 模板资源 }

function 字面量(值: object | string | number): string {
  return JSON.stringify(值).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')
}

/** 模板图片在需求目录下的位置，相对流程文件：assets/<流程文件名>-<操作编号>.png。 */
export function 模板资源相对路径(流程文件名前缀: string, 操作编号: number): string {
  return `assets/${流程文件名前缀}-${String(操作编号)}.png`
}

/**
 * 坐标点击在录制时被识别出元素或截图模板时，生成取代坐标点击的代码：
 * 有元素定位就按元素点击（先等元素出现、可点再点）；没有定位但有模板就等图片后点击；都没有返回 undefined，由调用方退回坐标。
 */
export function 生成增强点击语句(条目: 操作调用条目, 引擎: 引擎种类, 流程文件名前缀: string): 增强点击代码 | undefined {
  let 增强 = 条目.增强
  if (增强 === undefined) return undefined
  let 定位 = 增强.定位
  if (定位 !== undefined) {
    switch (引擎) {
      case '苹果':
      case '安卓': {
        let 目标 = { 按: 定位.种类 === '选择器' ? '网页选择器' : '网页文字', 值: 定位.值 }
        return { 语句们: [`await 引擎.点击(${字面量(目标)}, ${String(推算回放超时(条目))})`] }
      }
      case '浏览器': {
        let 目标 =
          定位.种类 === '选择器' ? `引擎.定位(${字面量(定位.值)})` : `引擎.按文本(${字面量(定位.值)}, { exact: true })`
        return { 语句们: [`await 引擎.点击(${目标}, { timeout: ${String(推算回放超时(条目))} })`] }
      }
    }
  }
  let 模板 = 增强.模板
  if (模板 === undefined) return undefined
  let 相对路径 = 模板资源相对路径(流程文件名前缀, 条目.id)
  let 选项 = { x: 模板.原坐标.x, y: 模板.原坐标.y, 比例: 模板.比例, 落点: 模板.落点 }
  return {
    语句们: [
      `await 引擎.等待图片后点击(new URL(${字面量(相对路径)}, import.meta.url), ${字面量(选项)}, ${String(推算回放超时(条目))})`,
    ],
    模板资源: { 操作编号: 条目.id, 来源路径: 模板.文件, 相对路径 },
  }
}

/** 录制时动作前后页面地址变了，回放在动作后等地址（按规范地址比较：忽略 origin、查询串和随机编号，三端相同）。 */
export function 生成等地址语句(条目: 操作调用条目, 引擎: 引擎种类): string[] {
  let 变化 = 条目.增强?.地址变化
  if (变化 === undefined) return []
  // 旧录制里的地址可能还带随机编号，导出时再规范一次
  let 目标 = 字面量(规范地址(变化.后))
  switch (引擎) {
    case '苹果':
    case '安卓':
      return [`await 引擎.等待地址(${目标}, ${String(推算回放超时(条目))})`]
    case '浏览器':
      // 以 / 或 # 开头的字符串由浏览器引擎按规范地址比较
      return [`await 引擎.等待地址(${目标}, { timeout: ${String(推算回放超时(条目))}, waitUntil: 'domcontentloaded' })`]
  }
}
