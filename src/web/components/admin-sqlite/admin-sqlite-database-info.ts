import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 创建元素 } from '../../global/tools/create-element'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 数据库信息组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-admin-sqlite-database-info', this)
  }

  private 版本标签: HTMLDivElement | null = null

  public constructor() {
    super()
  }

  protected override async 当加载时(): Promise<void> {
    let style = this.获得宿主样式()
    style.display = 'flex'
    style.flexDirection = 'column'
    style.padding = '20px'
    style.gap = '15px'
    style.backgroundColor = 'var(--卡片背景颜色)'
    style.borderRadius = '8px'
    style.boxShadow = '0 2px 8px var(--深阴影颜色)'
    style.border = '1px solid var(--边框颜色)'
    style.width = '100%'

    let 标题 = 创建元素('h2', {
      textContent: '数据库信息',
      style: {
        margin: '0',
        fontSize: '24px',
        fontWeight: 'bold',
        color: 'var(--文字颜色)',
        borderBottom: '2px solid var(--主色调)',
        paddingBottom: '10px',
      },
    })

    this.版本标签 = 创建元素('div', {
      style: {
        margin: '0',
        padding: '12px',
        backgroundColor: 'var(--悬浮背景颜色)',
        borderRadius: '6px',
        border: '1px solid var(--边框颜色)',
        fontSize: '16px',
        color: 'var(--文字颜色)',
      },
    })

    this.shadow.appendChild(标题)
    this.shadow.appendChild(this.版本标签)

    await this.刷新数据(this.渲染信号)
  }

  private async 刷新数据(信号: AbortSignal): Promise<void> {
    if (this.版本标签 === null) return
    let 版本标签 = this.版本标签
    try {
      let 结果 = await API管理器.请求postJson('/api/admin-sqlite/get-database-info', {}, { 信号 })
      switch (结果.status) {
        case 'success':
          版本标签.textContent = `SQLite版本: ${结果.data.version}`
          break
        case 'fail':
        case 'unexpected':
          版本标签.textContent = '获取版本失败'
          break
      }
    } catch (错误) {
      if (信号.aborted === true) throw 错误
      console.error('获取数据库信息失败:', 错误)
      版本标签.textContent = '获取版本失败'
    }
  }
}
