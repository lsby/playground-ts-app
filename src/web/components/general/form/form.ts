import { 增强样式类型 } from '../../../../web/global/types/style'
import { 组件基类, 要求组件构造参数 } from '../../../base/base'
import { 提示管理器 } from '../../../global/manager/hint-manager'
import { 创建元素, 应用宿主样式 } from '../../../global/tools/create-element'

export type 基础值 = string | number | boolean | null
export type 基础值结构 = 基础值 | 基础值结构[] | { [键: string]: 基础值结构 }
export type 表单数据 = Record<string, 基础值结构>

export type 表单元素<值类型 extends 基础值结构 = 基础值结构> = HTMLElement & {
  获得值(): 值类型
  设置值(值: 值类型): void
  设置禁用?(值: boolean): void
  获得禁用?(): boolean
  聚焦?(): void
  设置可访问名称?(名称: string): void
  设置校验状态?(错误: string | null, 描述文本列表: string[]): void
}

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

function 创建表单帮助按钮(提示内容: string): HTMLButtonElement {
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
  依赖字段?: Array<Extract<keyof 数据类型, string>>
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
  校验: (数据: Readonly<表单数据>) => Promise<string | null>
  依赖字段: ReadonlySet<string>
  变化时校验: boolean
  错误元素: HTMLDivElement | null
  当前错误: string | null
  描述元素标识列表: string[]
  描述文本列表: string[]
  已触碰: boolean
  已修改: boolean
  校验代次: number
}

type 项校验结果 = { 已过期: boolean; 错误: string | null }
type 表单校验结果<数据类型 extends 表单数据> = { 通过: boolean; 数据: 数据类型 }

type 表单事件<数据类型 extends 表单数据> = {
  变化: 数据类型
  校验: { 通过: boolean; 错误们: Partial<Record<keyof 数据类型, string>> }
  提交开始: 数据类型
  提交结束: { 成功: boolean }
}
type 监听表单事件 = { 输入: 基础值结构; 变化: 基础值结构; 失焦: void }

let 表单序号 = 0

export class 表单<数据类型 extends 表单数据> extends 组件基类<表单事件<数据类型>, 监听表单事件> {
  private 配置: 表单配置<数据类型>
  private 运行项映射 = new Map<string, 运行项>()
  private 默认值映射 = new Map<string, 基础值结构>()
  private 正在提交 = false
  private 数据代次 = 0
  private readonly 表单标识前缀: string

  public constructor(配置: 表单配置<数据类型>) {
    super()
    this.配置 = 要求组件构造参数(配置, '表单组件')
    表单序号 += 1
    this.表单标识前缀 = `lsby-form-${表单序号}`
    for (let 项 of this.配置.项列表) this.注册项(项)
    if (this.配置.初始数据 !== undefined) this.设置数据(this.配置.初始数据)
    for (let [键, 运行项] of this.运行项映射) this.默认值映射.set(键, this.复制值(运行项.获得值()))
  }

  protected override async 当加载时(): Promise<void> {
    应用宿主样式(this.获得宿主样式(), this.配置.宿主样式)
    this.获得宿主样式().containerType = 'inline-size'
    this.shadow.append(
      创建元素('style', {
        textContent: `
.lsby-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.lsby-form-item-full {
  grid-column: 1 / -1;
}
@container (max-width: 560px) {
  .lsby-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .lsby-form-item {
    grid-column: 1 / -1;
  }
}
@media (max-width: 640px) {
  .lsby-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .lsby-form-item {
    grid-column: 1 / -1;
  }
}`,
      }),
    )
    let 容器样式: 增强样式类型 = { display: 'grid', gap: 'var(--间距-4)' }
    let 容器 = 创建元素('div', { className: 'lsby-form-grid', style: { ...容器样式, ...this.配置.元素样式 } })
    容器.setAttribute('role', 'group')
    for (let 项索引 = 0; 项索引 < this.配置.项列表.length; 项索引 += 1) {
      let 项配置 = this.配置.项列表[项索引]
      if (项配置 === undefined) continue
      let 运行项 = this.运行项映射.get(项配置.键)
      if (运行项 === undefined) continue
      运行项.描述元素标识列表 = []
      运行项.描述文本列表 = []
      运行项.错误元素 = null
      let 项包装器 = 创建元素('div', {
        className:
          项配置.宽度 !== undefined && 项配置.宽度 > 1 ? 'lsby-form-item lsby-form-item-full' : 'lsby-form-item',
        style: { display: 'flex', flexDirection: 'column', gap: 'var(--间距-1)', minWidth: '0' },
      })
      let 标签文本 = 项配置.标签
      if (标签文本 !== undefined) {
        let 标签行 = 创建元素('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--间距-1)' } })
        let 标签 = 创建元素('span', { textContent: 标签文本, style: { fontWeight: '500' } })
        标签行.append(标签)
        if (项配置.必填 === true)
          标签行.append(创建元素('span', { textContent: '*', style: { color: 'var(--错误前景)' } }))
        let 提示 = 项配置.帮助文本 ?? 项配置.额外提示
        if (提示 !== undefined) 标签行.append(this.创建提示图标(提示))
        项包装器.append(标签行)
        let 设置名称 = '设置可访问名称' in 运行项.组件 ? 运行项.组件['设置可访问名称'] : undefined
        if (typeof 设置名称 === 'function') 设置名称.call(运行项.组件, 标签文本)
      }
      项包装器.append(运行项.组件)
      if (项配置.帮助文本 !== undefined) {
        let 帮助标识 = `${this.表单标识前缀}-help-${项索引}`
        项包装器.append(
          创建元素('div', {
            id: 帮助标识,
            textContent: 项配置.帮助文本,
            style: { color: 'var(--次要文字颜色)', fontSize: 'var(--字号-小)' },
          }),
        )
        运行项.描述元素标识列表.push(帮助标识)
        运行项.描述文本列表.push(项配置.帮助文本)
      }
      let 错误标识 = `${this.表单标识前缀}-error-${项索引}`
      let 错误元素 = 创建元素('div', {
        id: 错误标识,
        role: 'alert',
        style: { minHeight: '18px', color: 'var(--错误前景)', fontSize: 'var(--字号-小)' },
      })
      项包装器.append(错误元素)
      运行项.错误元素 = 错误元素
      运行项.描述元素标识列表.push(错误标识)
      this.显示项错误(运行项, 运行项.当前错误)
      容器.append(项包装器)
    }
    this.shadow.append(容器)
    for (let 运行项 of this.运行项映射.values()) {
      if (运行项.组件 instanceof 组件基类) await 运行项.组件.等待初始化()
      this.显示项错误(运行项, 运行项.当前错误)
    }
    this.监听冒泡事件('变化', async (event): Promise<void> => await this.处理子项变化(event))
    this.监听冒泡事件('输入', async (event): Promise<void> => await this.处理子项变化(event))
    this.监听冒泡事件('失焦', async (event): Promise<void> => await this.处理子项失焦(event))
  }

  public 获得数据(): 数据类型 {
    let 条目: Array<[string, 基础值结构]> = []
    for (let [键, 运行项] of this.运行项映射) 条目.push([键, 运行项.获得值()])
    return Object.fromEntries(条目) as 数据类型
  }

  public 设置数据(数据: Partial<数据类型>): void {
    this.应用数据(数据, false)
  }

  public 设置初始数据(数据: Partial<数据类型>): void {
    this.应用数据(数据, true)
  }

  private 应用数据(数据: Partial<数据类型>, 更新重置基准: boolean): void {
    for (let 键 of Object.keys(数据)) {
      let 值 = 数据[键]
      let 运行项 = this.运行项映射.get(键)
      if (值 !== undefined && 运行项 !== undefined) {
        this.使校验过期(运行项)
        运行项.设置值(值)
        if (更新重置基准 === true) {
          this.默认值映射.set(键, this.复制值(运行项.获得值()))
          运行项.已触碰 = false
          运行项.已修改 = false
          this.显示项错误(运行项, null)
        }
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
    return (await this.校验并获得数据()).通过
  }

  private async 校验并获得数据(通过时?: () => void): Promise<表单校验结果<数据类型>> {
    while (true) {
      let 本次数据代次 = this.数据代次
      let 数据快照 = this.获得数据()
      let 运行项们 = [...this.运行项映射.values()]
      let 结果们 = await Promise.all(运行项们.map(async (运行项) => await this.校验项(运行项, 数据快照, 本次数据代次)))
      if (本次数据代次 !== this.数据代次 || 结果们.some((结果): boolean => 结果.已过期 === true)) continue

      let 错误们: Partial<Record<keyof 数据类型, string>> = {}
      let 第一个错误: 运行项 | null = null
      for (let 索引 = 0; 索引 < 运行项们.length; 索引 += 1) {
        let 运行项 = 运行项们[索引]
        let 错误 = 结果们[索引]?.错误 ?? null
        if (运行项 !== undefined && 错误 !== null) {
          错误们[运行项.键 as keyof 数据类型] = 错误
          第一个错误 ??= 运行项
        }
      }
      let 通过 = 第一个错误 === null
      this.派发事件('校验', { 通过, 错误们 })
      if (本次数据代次 !== this.数据代次) continue
      if (第一个错误 !== null) 第一个错误.聚焦?.()
      else 通过时?.()
      return { 通过, 数据: 数据快照 }
    }
  }

  public async 提交(处理函数: (数据: 数据类型) => void | Promise<void>): Promise<boolean> {
    if (this.正在提交 === true) return false
    this.正在提交 = true
    let 原禁用映射 = new Map<运行项, boolean>()
    let 已开始提交 = false
    let 成功 = false
    try {
      let 校验结果 = await this.校验并获得数据((): void => {
        this.setAttribute('aria-busy', 'true')
        for (let 项 of this.运行项映射.values()) {
          原禁用映射.set(项, 项.获得禁用?.() ?? false)
          项.设置禁用?.(true)
        }
      })
      if (校验结果.通过 === false) return false
      已开始提交 = true
      this.派发事件('提交开始', 校验结果.数据)
      await 处理函数(校验结果.数据)
      成功 = true
      return true
    } finally {
      this.正在提交 = false
      this.removeAttribute('aria-busy')
      for (let [项, 原禁用] of 原禁用映射) 项.设置禁用?.(原禁用)
      if (已开始提交 === true) this.派发事件('提交结束', { 成功 })
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
      校验: async (数据: Readonly<表单数据>): Promise<string | null> => {
        let 值 = 数据[项.键]
        if (值 === undefined) throw new Error(`表单数据缺少字段: ${项.键}`)
        if (项.必填 === true && this.是空值(值) === true) return `${项.标签 ?? 项.键}为必填项`
        for (let 校验器 of 项.校验器们 ?? []) {
          let 错误 = await 校验器(值 as 数据类型[键], 数据 as Readonly<数据类型>)
          if (错误 !== null) return 错误
        }
        return null
      },
      依赖字段: new Set(项.依赖字段 ?? []),
      变化时校验: 项.变化时校验 ?? false,
      错误元素: null,
      当前错误: null,
      描述元素标识列表: [],
      描述文本列表: [],
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
    let 事件来源 = event.composedPath()[0]
    if (事件来源 === this || 事件来源 instanceof HTMLElement === false) return
    let 运行项 = [...this.运行项映射.values()].find((项) => 项.组件 === 事件来源)
    if (运行项 === undefined) return
    let 受影响项 = [
      运行项,
      ...[...this.运行项映射.values()].filter(
        (候选项): boolean => 候选项 !== 运行项 && 候选项.依赖字段.has(运行项.键) === true,
      ),
    ]
    for (let 项 of 受影响项) this.使校验过期(项)
    运行项.已修改 = true
    await Promise.all(
      受影响项
        .filter((项): boolean => 项.变化时校验 === true || 项.已触碰 === true)
        .map(async (项): Promise<void> => {
          await this.校验最新值(项)
        }),
    )
    this.派发事件('变化', this.获得数据())
  }

  private async 处理子项失焦(event: CustomEvent<void>): Promise<void> {
    let 事件来源 = event.composedPath()[0]
    if (事件来源 instanceof HTMLElement === false) return
    let 运行项 = [...this.运行项映射.values()].find((项) => 项.组件 === 事件来源)
    if (运行项 === undefined) return
    运行项.已触碰 = true
    await this.校验最新值(运行项)
  }

  private async 校验项(运行项: 运行项, 数据快照: Readonly<数据类型>, 数据代次: number): Promise<项校验结果> {
    let 本次代次 = 运行项.校验代次
    运行项.组件.setAttribute('aria-busy', 'true')
    try {
      let 错误 = await 运行项.校验(数据快照)
      let 已过期 = 本次代次 !== 运行项.校验代次 || 数据代次 !== this.数据代次
      if (已过期 === false) this.显示项错误(运行项, 错误)
      return { 已过期, 错误 }
    } finally {
      if (本次代次 === 运行项.校验代次) 运行项.组件.removeAttribute('aria-busy')
    }
  }

  private async 校验最新值(运行项: 运行项): Promise<string | null> {
    while (true) {
      let 数据代次 = this.数据代次
      let 结果 = await this.校验项(运行项, this.获得数据(), 数据代次)
      if (结果.已过期 === false) return 结果.错误
    }
  }

  private 使校验过期(运行项: 运行项): void {
    this.数据代次 += 1
    运行项.校验代次 += 1
    运行项.组件.removeAttribute('aria-busy')
  }

  private 显示项错误(运行项: 运行项, 错误: string | null): void {
    运行项.当前错误 = 错误
    if (运行项.错误元素 !== null) 运行项.错误元素.textContent = 错误 ?? ''
    运行项.组件.setAttribute('aria-invalid', 错误 === null ? 'false' : 'true')
    运行项.组件.setAttribute('aria-describedby', 运行项.描述元素标识列表.join(' '))
    let 设置校验状态 = '设置校验状态' in 运行项.组件 ? 运行项.组件['设置校验状态'] : undefined
    if (typeof 设置校验状态 === 'function') 设置校验状态.call(运行项.组件, 错误, 运行项.描述文本列表)
  }

  private 是空值(值: 基础值结构): boolean {
    if (值 === null) return true
    if (typeof 值 === 'string') return 值.trim() === ''
    if (Array.isArray(值)) return 值.length === 0
    return false
  }

  private 复制值(值: 基础值结构): 基础值结构 {
    if (Array.isArray(值)) return 值.map((项): 基础值结构 => this.复制值(项))
    if (typeof 值 === 'object' && 值 !== null) {
      let 结果: Record<string, 基础值结构> = {}
      for (let [键, 子值] of Object.entries(值)) 结果[键] = this.复制值(子值)
      return 结果
    }
    return 值
  }

  private 创建提示图标(提示: string): HTMLElement {
    return 创建表单帮助按钮(提示)
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
    super(要求组件构造参数(配置, '动态表单组件') as 表单配置<表单数据>)
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
  public abstract 设置禁用(值: boolean): void
  public abstract 获得禁用(): boolean
  public abstract 聚焦(): void
  public abstract 设置可访问名称(名称: string): void
  public abstract 设置校验状态(错误: string | null, 描述文本列表: string[]): void

  protected 创建提示图标(提示内容: string): HTMLElement {
    return 创建表单帮助按钮(提示内容)
  }
}

表单.注册组件('lsby-form', 表单)
