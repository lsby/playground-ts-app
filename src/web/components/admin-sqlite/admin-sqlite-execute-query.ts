import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 普通按钮 } from '../general/base/base-button'
import { 创建图标 } from '../general/base/icon'
import { 表格组件 } from '../general/table/table'
import { 数据表加载数据参数 } from '../general/table/types'

type 发出事件类型 = {}
type 监听事件类型 = {}

type 选项卡数据 = { id: string; 标题: string; sql: string }

type 查询结果数据 = { rows: Record<string, any>[]; numAffectedRows?: number | undefined; insertId?: number | undefined }

export class 数据库执行查询组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-admin-sqlite-execute-query', this)
  }

  private 选项卡列表: 选项卡数据[] = []
  private 当前选项卡索引: number = 0
  private 选项卡头容器: HTMLDivElement = 创建元素('div')
  private 内容容器: HTMLDivElement = 创建元素('div')
  private 添加选项卡按钮: 普通按钮 = new 普通按钮({
    文本: '添加',
    标题: '添加查询选项卡',
    图标: 创建图标('plus'),
    点击处理函数: () => this.添加选项卡(),
    宿主样式: { display: 'flex' },
  })
  private 选项卡内容映射: Map<
    string,
    {
      sql输入: HTMLTextAreaElement
      执行按钮: 普通按钮
      结果容器: HTMLDivElement
      表格组件: 表格组件<Record<string, any>> | null
    }
  > = new Map()
  private 选项卡结果映射: Map<string, 查询结果数据 | null> = new Map()

  public constructor() {
    super()
    this.添加默认选项卡()
  }

  private 添加默认选项卡(): void {
    let id = this.生成选项卡Id()
    this.选项卡列表.push({ id, 标题: '查询1', sql: '' })
  }

  private 生成选项卡Id(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  protected override async 当加载时(): Promise<void> {
    let style = this.获得宿主样式()
    style.display = 'flex'
    style.flexDirection = 'column'
    style.width = '100%'
    style.height = '100%'
    style.overflow = 'hidden'

    this.选项卡头容器.style.display = 'flex'
    this.选项卡头容器.style.borderBottom = '1px solid var(--边框颜色)'
    this.选项卡头容器.style.gap = '10px'
    this.选项卡头容器.style.padding = '10px'
    this.选项卡头容器.style.overflowX = 'auto'

    this.内容容器.style.flex = '1'
    this.内容容器.style.display = 'flex'
    this.内容容器.style.flexDirection = 'column'
    this.内容容器.style.overflow = 'hidden'

    this.shadow.appendChild(this.选项卡头容器)
    this.shadow.appendChild(this.内容容器)

    this.更新UI()
  }

  private 更新UI(): void {
    this.更新选项卡头部()
    this.更新选项卡内容()
  }

  private 更新选项卡头部(): void {
    this.选项卡头容器.innerHTML = ''

    this.选项卡列表.forEach((选项卡, 索引) => {
      let 选项卡按钮 = 创建元素('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '6px 12px',
          border: 索引 === this.当前选项卡索引 ? '1px solid var(--主色调)' : '1px solid var(--边框颜色)',
          borderBottom: 索引 === this.当前选项卡索引 ? 'none' : '1px solid var(--边框颜色)',
          backgroundColor: 索引 === this.当前选项卡索引 ? 'var(--主色调)' : 'var(--背景颜色)',
          color: 索引 === this.当前选项卡索引 ? 'white' : 'var(--文字颜色)',
          cursor: 'pointer',
          borderRadius: '4px 4px 0 0',
          userSelect: 'none',
        },
      })

      let 标题span = 创建元素('span', { textContent: 选项卡.标题, style: { flex: '1' } })
      let 关闭按钮 = new 普通按钮({
        文本: '✕',
        点击处理函数: (e: Event): void => {
          e.stopPropagation()
          this.删除选项卡(索引)
        },
      })

      选项卡按钮.appendChild(标题span)
      选项卡按钮.appendChild(关闭按钮)
      选项卡按钮.onclick = (): void => this.切换选项卡(索引)

      this.选项卡头容器.appendChild(选项卡按钮)
    })

    this.选项卡头容器.appendChild(this.添加选项卡按钮)
  }

  private 更新选项卡内容(): void {
    this.内容容器.innerHTML = ''

    if (this.选项卡列表.length === 0) return

    let 当前选项卡 = this.选项卡列表[this.当前选项卡索引]
    if (当前选项卡 === undefined) return

    let 内容 = this.获取或创建选项卡内容(当前选项卡.id)

    this.内容容器.appendChild(内容.sql输入)
    this.内容容器.appendChild(内容.执行按钮)
    this.内容容器.appendChild(内容.结果容器)

    内容.sql输入.value = 当前选项卡.sql

    let 结果 = this.选项卡结果映射.get(当前选项卡.id)
    if (结果 !== null && 结果 !== undefined) {
      this.显示查询结果(内容, 结果)
    }
  }

  private 获取或创建选项卡内容(tabId: string): {
    sql输入: HTMLTextAreaElement
    执行按钮: 普通按钮
    结果容器: HTMLDivElement
    表格组件: 表格组件<Record<string, any>> | null
  } {
    let 内容 = this.选项卡内容映射.get(tabId)
    if (内容 !== undefined) {
      return 内容
    }

    let sql输入 = 创建元素('textarea', {
      placeholder: '输入SQL语句...',
      style: {
        width: '100%',
        height: '100px',
        margin: '10px 0',
        padding: '8px',
        fontFamily: 'monospace',
        fontSize: '14px',
        border: '1px solid var(--边框颜色)',
        backgroundColor: 'var(--背景颜色)',
        color: 'var(--文字颜色)',
        resize: 'vertical',
        outline: 'none',
      },
    })

    let 执行按钮 = new 普通按钮({
      文本: '执行',
      点击处理函数: async (): Promise<void> => this.查询(tabId),
      宿主样式: { marginBottom: '10px' },
    })

    let 结果容器 = 创建元素('div', {
      style: {
        border: '1px solid var(--边框颜色)',
        overflow: 'auto',
        backgroundColor: 'var(--背景颜色)',
        minWidth: '0',
        flex: '1 1 0',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      },
    })

    let 新内容 = { sql输入, 执行按钮, 结果容器, 表格组件: null }
    this.选项卡内容映射.set(tabId, 新内容)
    return 新内容
  }

  private 切换选项卡(index: number): void {
    if (index < 0 || index >= this.选项卡列表.length) return
    this.当前选项卡索引 = index
    this.更新UI()
  }

  private 添加选项卡(): void {
    let id = this.生成选项卡Id()
    let 选项卡编号 = this.选项卡列表.length + 1
    this.选项卡列表.push({ id, 标题: `查询${选项卡编号}`, sql: '' })
    this.当前选项卡索引 = this.选项卡列表.length - 1
    this.更新UI()
  }

  private 删除选项卡(index: number): void {
    if (this.选项卡列表.length <= 1) return
    if (index < 0 || index >= this.选项卡列表.length) return

    let 选项卡 = this.选项卡列表[index]
    if (选项卡 === undefined) return

    this.选项卡列表.splice(index, 1)
    this.选项卡内容映射.delete(选项卡.id)
    this.选项卡结果映射.delete(选项卡.id)

    if (this.当前选项卡索引 >= this.选项卡列表.length) {
      this.当前选项卡索引 = this.选项卡列表.length - 1
    }

    this.更新UI()
  }

  private async 查询(tabId: string): Promise<void> {
    let 选项卡 = this.选项卡列表.find((t) => t.id === tabId)
    if (选项卡 === undefined) return

    let 内容 = this.选项卡内容映射.get(tabId)
    if (内容 === undefined) return

    let sql = 内容.sql输入.value.trim()
    选项卡.sql = sql

    if (sql === '') {
      this.显示结果(内容, '请输入SQL语句')
      return
    }

    try {
      let 结果 = await API管理器.请求postJson('/api/admin-sqlite/execute-query', { sql, parameters: [] })
      switch (结果.status) {
        case 'success':
          this.选项卡结果映射.set(tabId, 结果.data)
          this.显示查询结果(内容, 结果.data)
          break
        case 'fail':
        case 'unexpected':
          this.显示结果(内容, '查询失败')
          break
      }
    } catch (错误) {
      console.error('查询失败:', 错误)
      this.显示结果(内容, '查询失败')
    }
  }

  private 显示查询结果(
    内容: {
      sql输入: HTMLTextAreaElement
      执行按钮: 普通按钮
      结果容器: HTMLDivElement
      表格组件: 表格组件<Record<string, any>> | null
    },
    数据: 查询结果数据,
  ): void {
    内容.结果容器.innerHTML = ''

    if (数据.rows.length === 0) {
      let 消息容器 = 创建元素('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '1',
          gap: '12px',
        },
      })

      let 文本 = 创建元素('div', { textContent: '查询无结果', style: { color: 'var(--次要文字颜色)' } })
      消息容器.appendChild(文本)

      if (数据.numAffectedRows !== undefined) {
        let 影响行数 = 创建元素('div', {
          textContent: `影响行数: ${数据.numAffectedRows}`,
          style: { fontWeight: 'bold', color: 'var(--文字颜色)' },
        })
        消息容器.appendChild(影响行数)
      }

      内容.结果容器.appendChild(消息容器)
      return
    }

    // 提取列配置
    let 第一行 = 数据.rows[0]
    if (第一行 === undefined) return

    let 列配置 = Object.keys(第一行).map((列名) => ({ 字段名: 列名, 显示名: 列名, 可排序: false }))

    // 每次都重新创建表格以确保数据更新
    内容.表格组件 = new 表格组件<Record<string, any>>({
      行键: (数据项, 索引): string => `${JSON.stringify(数据项)}-${索引}`,
      列配置,
      每页数量: 20,
      加载数据: async (
        参数: 数据表加载数据参数<Record<string, any>>,
      ): Promise<{ 数据: Record<string, any>[]; 总数: number }> => {
        // 在内存中分页
        let 开始 = (参数.页码 - 1) * 参数.每页数量
        let 结束 = 开始 + 参数.每页数量
        return { 数据: 数据.rows.slice(开始, 结束), 总数: 数据.rows.length }
      },
    })

    内容.结果容器.appendChild(内容.表格组件)
  }

  private 显示结果(
    内容: {
      sql输入: HTMLTextAreaElement
      执行按钮: 普通按钮
      结果容器: HTMLDivElement
      表格组件: 表格组件<Record<string, any>> | null
    },
    消息: string,
  ): void {
    内容.结果容器.innerHTML = ''
    let 消息元素 = 创建元素('div', {
      textContent: 消息,
      style: { padding: '20px', textAlign: 'center', color: 'var(--次要文字颜色)' },
    })

    内容.结果容器.appendChild(消息元素)
  }
}
