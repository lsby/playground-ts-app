import { 环境变量 } from '../../../global/env'
import { 组件基类 } from '../../base/base'
import { globalWebLog } from '../../global/manager/log-manager'

type 发出事件类型 = {}
type 监听事件类型 = {}

let 调试补丁已安装 = false
let 调试补丁引用数 = 0
let 排除事件计数 = new Map<string, number>()

function 获得捕获选项(选项?: boolean | AddEventListenerOptions | EventListenerOptions): boolean {
  if (typeof 选项 === 'boolean') return 选项
  return 选项?.capture === true
}

function 获得监听器键(类型: string, 选项?: boolean | AddEventListenerOptions | EventListenerOptions): string {
  return `${类型}:${获得捕获选项(选项) ? 'capture' : 'bubble'}`
}

function 是排除事件(类型: string): boolean {
  return (排除事件计数.get(类型) ?? 0) > 0
}

function 安装调试补丁(): void {
  let 原始添加监听器 = EventTarget.prototype.addEventListener
  let 原始移除监听器 = EventTarget.prototype.removeEventListener
  let 原始派发事件 = EventTarget.prototype.dispatchEvent
  let 目标监听器映射 = new WeakMap<
    EventTarget,
    WeakMap<EventListenerOrEventListenerObject, Map<string, EventListener>>
  >()

  EventTarget.prototype.addEventListener = function (type, listener, options): void {
    if (listener === null) {
      原始添加监听器.call(this, type, listener, options)
      return
    }

    let 组件日志 = globalWebLog.extend(this.constructor.name)
    if (调试补丁引用数 > 0 && 是排除事件(type) === false) void 组件日志.debug('监听事件: %o', type)
    let 监听器映射 = 目标监听器映射.get(this)
    if (监听器映射 === undefined) {
      监听器映射 = new WeakMap<EventListenerOrEventListenerObject, Map<string, EventListener>>()
      目标监听器映射.set(this, 监听器映射)
    }
    let 键 = 获得监听器键(type, options)
    let 包装函数映射 = 监听器映射.get(listener)
    if (包装函数映射 === undefined) {
      包装函数映射 = new Map<string, EventListener>()
      监听器映射.set(listener, 包装函数映射)
    }
    let 已有包装函数 = 包装函数映射.get(键)
    if (已有包装函数 !== undefined) {
      原始添加监听器.call(this, type, 已有包装函数, options)
      return
    }
    let 目标 = this
    let 包装函数: EventListener = (event): void => {
      if (调试补丁引用数 > 0 && 是排除事件(type) === false) void 组件日志.debug('事件触发: %o', type)
      if (typeof listener === 'function') listener.call(目标, event)
      else listener.handleEvent(event)
    }
    包装函数映射.set(键, 包装函数)
    原始添加监听器.call(this, type, 包装函数, options)
  }

  EventTarget.prototype.removeEventListener = function (type, listener, options): void {
    if (listener === null) {
      原始移除监听器.call(this, type, listener, options)
      return
    }
    let 包装函数映射 = 目标监听器映射.get(this)?.get(listener)
    let 键 = 获得监听器键(type, options)
    let 包装函数 = 包装函数映射?.get(键)
    原始移除监听器.call(this, type, 包装函数 ?? listener, options)
    包装函数映射?.delete(键)
  }

  EventTarget.prototype.dispatchEvent = function (event): boolean {
    if (调试补丁引用数 > 0 && 是排除事件(event.type) === false) {
      let 组件日志 = globalWebLog.extend(this.constructor.name)
      void 组件日志.debug(event instanceof CustomEvent ? '派发自定义事件: %o' : '派发事件: %o', event.type)
    }
    return 原始派发事件.call(this, event)
  }
}

function 启用调试补丁(排除事件: string[]): () => void {
  for (let 类型 of 排除事件) 排除事件计数.set(类型, (排除事件计数.get(类型) ?? 0) + 1)
  调试补丁引用数 += 1
  if (调试补丁已安装 === false) {
    安装调试补丁()
    调试补丁已安装 = true
  }
  let 已清理 = false
  return (): void => {
    if (已清理 === true) return
    已清理 = true
    for (let 类型 of 排除事件) {
      let 数量 = (排除事件计数.get(类型) ?? 1) - 1
      if (数量 <= 0) 排除事件计数.delete(类型)
      else 排除事件计数.set(类型, 数量)
    }
    调试补丁引用数 -= 1
  }
}

export class 设置调试组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-set-debug', this)
  }

  public constructor(配置?: { 排除事件?: string }) {
    super()
    if (配置?.排除事件 !== undefined) {
      this.setAttribute('排除事件', 配置.排除事件)
    }
  }

  protected override async 当加载时(): Promise<void> {
    console.log('当前环境: %o', 环境变量.NODE_ENV)

    if (环境变量.NODE_ENV !== 'development') {
      // 生产模式
      localStorage['debug'] = ''
    } else {
      localStorage['debug'] = '*'

      let 排除事件属性 = this.getAttribute('排除事件')
      let 排除事件: string[] = 排除事件属性 !== null ? 排除事件属性.split(',') : []

      this.注册清理(启用调试补丁(排除事件))
    }
  }
}
