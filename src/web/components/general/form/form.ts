import { 增强样式类型 } from '../../../../web/global/types/style'
import { 组件基类 } from '../../../base/base'
import { 提示管理器 } from '../../../global/manager/hint-manager'
import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'

export type 基础值 = string | number | boolean | null
export type 基础值结构 = 基础值 | 基础值结构[] | { [键: string]: 基础值结构 }
export type 表单数据 = Record<string, 基础值结构>

export interface 表单元素<值类型 extends 基础值结构 = 基础值结构> extends HTMLElement {
  获得值(): 值类型
  设置值(值: 值类型): void
  设置禁用?(值: boolean): void
  获得禁用?(): boolean
  聚焦?(): void
  设置可访问名称?(名称: string): void
}

export type 表单校验器<值类型 extends 基础值结构, 数据类型 extends 表单数据> = (
  值: 值类型,
  数据: Readonly<数据类型>,
) => string | null | Promise<string | null>

export type 表单项配置<
  数据类型 extends 表单数据,
  键 extends Extract<keyof 数据类型, string> = Extract<keyof 数据类型, string>,
> = {
  键: 键
  组件: 表单元素<数据类型[键]>
  宽度?: number
  标签?: string
  帮助文本?: string
  额外提示?: string
  必填?: boolean
  校验器们?: Array<表单校验器<数据类型[键], 数据类型>>
  变化时校验?: boolean
}

type 表单项联合<数据类型 extends 表单数据> = {
  [键 in Extract<keyof 数据类型, string>]: 表单项配置<数据类型, 键>
}[Extract<keyof 数据类型, string>]

export type 表单配置<数据类型 extends 表单数据> = {
  项列表: Array<表单项联合<数据类型>>
  初始数据?: Partial<数据类型>
  宿主样式?: 增强样式类型
  元素样式?: 增强样式类型
}

type 运行项 = {
  键: string
  组件: HTMLElement
  获得值: () => 基础值结构
  设置值: (值: 基础值结构) => void
  设置禁用?: (value: boolean) => void
  获得禁用?: () => boolean
  聚焦?: () => void
  校验: () => Promise<string | null>
  变化时校验: boolean
  错误元素: HTMLDivElement | null
  已触碰: boolean
  已修改: boolean
  校验代次: number
}

type 项校验结果 = { 已过期: boolean; 错误: string | null }

type 表单事件<数据类型 extends 表单数据> = {
  变化: 数据类型
  校验: { 通过: boolean; 错误们: Partial<Record<keyof 数据类型, string>> }
  提交开始: 数据类型
  提交结束: { 成功: boolean }
}
type 监听表单事件 = { 变化: 基础值结构; 失焦: void }

export class 表单<数据类型 extends 表单数据> extends 组件基类<表单事件<数据类型>, 监听表单事件> {
  private 配置: 表单配置<数据类型>
  private 运行项映射 = new Map<string, 运行项>()
  private 默认值映射 = new Map<string, 基础值结构>()
  private 正在提交 = false
  private 数据代次 = 0

  public constructor(配置: 表单配置<数据类型>) {
    super()
    this.配置 = 配置
    for (let 项 of 配置.项列表) this.注册项(项)
    if (配置.初始数据 !== undefined) this.设置数据(配置.初始数据)
    for (let [键, 运行项] of this.运行项映射) this.默认值映射.set(键, 运行项.获得值())
  }

  protected override 当加载时(): void {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)
    let 容器样式: 增强样式类型 = {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 'var(--间距-4)',
    }
    let 容器 = 创建元素('div', { style: { ...容器样式, ...this.配置.元素样式 } })
    容器.setAttribute('role', 'group')
    for (let 项配置 of this.配置.项列表) {
      let 运行项 = this.运行项映射.get(项配置.键)
      if (运行项 === undefined) continue
      let 项包装器 = 创建元素('div', {
        style: {
          gridColumn: `span ${项配置.宽度 ?? 1}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--间距-1)',
          minWidth: '0',
        },
      })
      let 标签文本 = 项配置.标签
      if (标签文本 !== undefined) {
        let 标签行 = 创建元素('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--间距-1)' } })
        let 标签 = 创建元素('span', { textContent: 标签文本, style: { fontWeight: '500' } })
        标签行.append(标签)
        if (项配置.必填 === true)
          标签行.append(创建元素('span', { textContent: '*', style: { color: 'var(--错误颜色)' } }))
        let 提示 = 项配置.帮助文本 ?? 项配置.额外提示
        if (提示 !== undefined) 标签行.append(this.创建提示图标(提示))
        项包装器.append(标签行)
        let 设置名称 = '设置可访问名称' in 运行项.组件 ? 运行项.组件['设置可访问名称'] : undefined
        if (typeof 设置名称 === 'function') 设置名称.call(运行项.组件, 标签文本)
      }
      项包装器.append(运行项.组件)
      if (项配置.帮助文本 !== undefined) {
        项包装器.append(
          创建元素('div', {
            textContent: 项配置.帮助文本,
            style: { color: 'var(--次要文字颜色)', fontSize: 'var(--字号-小)' },
          }),
        )
      }
      let 错误元素 = 创建元素('div', {
        role: 'alert',
        style: { minHeight: '18px', color: 'var(--错误颜色)', fontSize: 'var(--字号-小)' },
      })
      项包装器.append(错误元素)
      运行项.错误元素 = 错误元素
      容器.append(项包装器)
    }
    this.shadow.append(容器)
    this.监听冒泡事件('变化', async (event): Promise<void> => await this.处理子项变化(event))
    this.监听冒泡事件('失焦', async (event): Promise<void> => await this.处理子项失焦(event))
  }

  public 获得数据(): 数据类型 {
    let 条目: Array<[string, 基础值结构]> = []
    for (let [键, 运行项] of this.运行项映射) 条目.push([键, 运行项.获得值()])
    return Object.fromEntries(条目) as 数据类型
  }

  public 设置数据(数据: Partial<数据类型>): void {
    for (let 键 of Object.keys(数据)) {
      let 值 = 数据[键]
      let 运行项 = this.运行项映射.get(键)
      if (值 !== undefined && 运行项 !== undefined) {
        this.使校验过期(运行项)
        运行项.设置值(值)
      }
    }
  }

  public 获得项值<键 extends Extract<keyof 数据类型, string>>(键: 键): 数据类型[键] {
    let 运行项 = this.运行项映射.get(键)
    if (运行项 === undefined) throw new Error(`表单项不存在: ${键}`)
    return 运行项.获得值() as 数据类型[键]
  }

  public 设置项值<键 extends Extract<keyof 数据类型, string>>(键: 键, 值: 数据类型[键]): void {
    let 运行项 = this.运行项映射.get(键)
    if (运行项 === undefined) throw new Error(`表单项不存在: ${键}`)
    this.使校验过期(运行项)
    运行项.设置值(值)
  }

  public 获得所有元素(): Partial<Record<keyof 数据类型, HTMLElement>> {
    let 条目: Array<[string, HTMLElement]> = []
    for (let [键, 运行项] of this.运行项映射) 条目.push([键, 运行项.组件])
    return Object.fromEntries(条目) as Partial<Record<keyof 数据类型, HTMLElement>>
  }

  public async 校验(): Promise<boolean> {
    let 错误们: Partial<Record<keyof 数据类型, string>> = {}
    let 第一个错误: 运行项 | null = null
    for (let 运行项 of this.运行项映射.values()) {
      let 错误 = await this.校验最新值(运行项)
      if (错误 !== null) {
        错误们[运行项.键 as keyof 数据类型] = 错误
        第一个错误 ??= 运行项
      }
    }
    let 通过 = 第一个错误 === null
    this.派发事件('校验', { 通过, 错误们 })
    if (第一个错误 !== null) 第一个错误.聚焦?.()
    return 通过
  }

  public async 提交(处理函数: (数据: 数据类型) => void | Promise<void>): Promise<boolean> {
    if (this.正在提交 === true || (await this.校验()) === false) return false
    this.正在提交 = true
    let 原禁用映射 = new Map<运行项, boolean>()
    let 数据 = this.获得数据()
    this.setAttribute('aria-busy', 'true')
    for (let 项 of this.运行项映射.values()) {
      原禁用映射.set(项, 项.获得禁用?.() ?? false)
      项.设置禁用?.(true)
    }
    this.派发事件('提交开始', 数据)
    let 成功 = false
    try {
      await 处理函数(数据)
      成功 = true
      return true
    } finally {
      this.正在提交 = false
      this.removeAttribute('aria-busy')
      for (let [项, 原禁用] of 原禁用映射) 项.设置禁用?.(原禁用)
      this.派发事件('提交结束', { 成功 })
    }
  }

  public 重置(): void {
    for (let [键, 运行项] of this.运行项映射) {
      this.使校验过期(运行项)
      let 默认值 = this.默认值映射.get(键)
      if (默认值 !== undefined) 运行项.设置值(默认值)
      运行项.已触碰 = false
      运行项.已修改 = false
      this.显示项错误(运行项, null)
    }
    this.派发事件('变化', this.获得数据())
  }

  public 获得已修改(): boolean {
    return [...this.运行项映射.values()].some((项) => 项.已修改 === true)
  }

  public 获得正在提交(): boolean {
    return this.正在提交
  }

  private 注册项<键 extends Extract<keyof 数据类型, string>>(项: 表单项配置<数据类型, 键>): void {
    if (this.运行项映射.has(项.键) === true) throw new Error(`表单项重复: ${项.键}`)
    let 运行项: 运行项 = {
      键: 项.键,
      组件: 项.组件,
      获得值: (): 基础值结构 => 项.组件.获得值(),
      设置值: (值: 基础值结构): void => 项.组件.设置值(值 as 数据类型[键]),
      校验: async (): Promise<string | null> => {
        let 值 = 项.组件.获得值()
        if (项.必填 === true && this.是空值(值) === true) return `${项.标签 ?? 项.键}为必填项`
        for (let 校验器 of 项.校验器们 ?? []) {
          let 错误 = await 校验器(值, this.获得数据())
          if (错误 !== null) return 错误
        }
        return null
      },
      变化时校验: 项.变化时校验 ?? false,
      错误元素: null,
      已触碰: false,
      已修改: false,
      校验代次: 0,
    }
    if (项.组件.设置禁用 !== undefined) 运行项.设置禁用 = (值: boolean): void => 项.组件.设置禁用?.(值)
    if (项.组件.获得禁用 !== undefined) 运行项.获得禁用 = (): boolean => 项.组件.获得禁用?.() ?? false
    if (项.组件.聚焦 !== undefined) 运行项.聚焦 = (): void => 项.组件.聚焦?.()
    this.运行项映射.set(项.键, 运行项)
  }

  private async 处理子项变化(event: CustomEvent<基础值结构>): Promise<void> {
    if (event.target === this || event.target instanceof HTMLElement === false) return
    let 运行项 = [...this.运行项映射.values()].find((项) => 项.组件 === event.target)
    if (运行项 === undefined) return
    this.使校验过期(运行项)
    运行项.已修改 = true
    if (运行项.变化时校验 === true || 运行项.已触碰 === true) await this.校验项(运行项)
    this.派发事件('变化', this.获得数据())
  }

  private async 处理子项失焦(event: CustomEvent<void>): Promise<void> {
    if (event.target instanceof HTMLElement === false) return
    let 运行项 = [...this.运行项映射.values()].find((项) => 项.组件 === event.target)
    if (运行项 === undefined) return
    运行项.已触碰 = true
    await this.校验项(运行项)
  }

  private async 校验项(运行项: 运行项): Promise<项校验结果> {
    运行项.校验代次 += 1
    let 本次代次 = 运行项.校验代次
    let 本次数据代次 = this.数据代次
    运行项.组件.setAttribute('aria-busy', 'true')
    try {
      let 错误 = await 运行项.校验()
      let 已过期 = 本次代次 !== 运行项.校验代次 || 本次数据代次 !== this.数据代次
      if (已过期 === false) this.显示项错误(运行项, 错误)
      return { 已过期, 错误 }
    } finally {
      if (本次代次 === 运行项.校验代次) 运行项.组件.removeAttribute('aria-busy')
    }
  }

  private async 校验最新值(运行项: 运行项): Promise<string | null> {
    let 结果 = await this.校验项(运行项)
    while (结果.已过期 === true) 结果 = await this.校验项(运行项)
    return 结果.错误
  }

  private 使校验过期(运行项: 运行项): void {
    this.数据代次 += 1
    运行项.校验代次 += 1
    运行项.组件.removeAttribute('aria-busy')
  }

  private 显示项错误(运行项: 运行项, 错误: string | null): void {
    if (运行项.错误元素 !== null) 运行项.错误元素.textContent = 错误 ?? ''
    运行项.组件.setAttribute('aria-invalid', 错误 === null ? 'false' : 'true')
  }

  private 是空值(值: 基础值结构): boolean {
    if (值 === null) return true
    if (typeof 值 === 'string') return 值.trim() === ''
    if (Array.isArray(值)) return 值.length === 0
    return false
  }

  private 创建提示图标(提示: string): HTMLElement {
    let 图标 = 创建元素('button', {
      type: 'button',
      textContent: '?',
      title: '查看帮助',
      style: { width: '18px', height: '18px', padding: '0', borderRadius: '50%', fontSize: '11px', cursor: 'help' },
    })
    图标.onmouseenter = (): void => 提示管理器.显示({ 文本: 提示 }, 图标)
    图标.onmouseleave = (): void => 提示管理器.隐藏()
    图标.onfocus = (): void => 提示管理器.显示({ 文本: 提示 }, 图标)
    图标.onblur = (): void => 提示管理器.隐藏()
    return 图标
  }
}

export type 动态表单项配置 = {
  键: string
  组件: 表单元素
  宽度?: number
  标签?: string
  帮助文本?: string
  额外提示?: string
  必填?: boolean
}

export class 动态表单 extends 表单<表单数据> {
  public constructor(配置: { 项列表: 动态表单项配置[]; 宿主样式?: 增强样式类型; 元素样式?: 增强样式类型 }) {
    super(配置 as 表单配置<表单数据>)
  }
}

export abstract class 表单组件基类<
  发出事件类型 extends Record<string, unknown> = Record<string, unknown>,
  监听事件类型 extends Record<string, unknown> = Record<string, unknown>,
  值类型 extends 基础值结构 = 基础值结构,
>
  extends 组件基类<发出事件类型, 监听事件类型>
  implements 表单元素<值类型>
{
  public abstract 获得值(): 值类型
  public abstract 设置值(值: 值类型): void

  protected 创建提示图标(提示内容: string): HTMLElement {
    let 图标 = 创建元素('button', {
      type: 'button',
      textContent: '?',
      title: '查看帮助',
      style: { width: '18px', height: '18px', padding: '0', borderRadius: '50%', cursor: 'help' },
    })
    图标.onmouseenter = (): void => 提示管理器.显示({ 文本: 提示内容 }, 图标)
    图标.onmouseleave = (): void => 提示管理器.隐藏()
    return 图标
  }
}

表单.注册组件('lsby-form', 表单)
