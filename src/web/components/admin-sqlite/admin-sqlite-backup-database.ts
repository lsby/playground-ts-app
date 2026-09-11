import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 显示模态框 } from '../../global/manager/modal-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 普通按钮 } from '../general/base/base-button'
import { 日志分栏组件 } from '../general/log/log-split'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 数据库备份组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-admin-sqlite-backup-database', this)
  }

  public constructor() {
    super()
  }

  protected override async 当加载时(): Promise<void> {
    let style = this.获得宿主样式()
    style.display = 'flex'
    style.flexDirection = 'column'
    style.padding = '20px'
    style.gap = '10px'
    style.width = '100%'

    let 标题 = 创建元素('h2', {
      textContent: '备份数据库',
      style: { fontSize: '20px', fontWeight: 'bold', margin: '0 0 16px 0' },
    })

    let 备份按钮 = new 普通按钮({
      文本: '开始备份',
      点击处理函数: (): void => {
        let splitLog = new 日志分栏组件()

        let 左侧内容 = 创建元素('div', {
          style: {
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
          },
        })

        let 开始备份按钮 = new 普通按钮({
          文本: '开始备份',
          点击处理函数: async (): Promise<void> => {
            开始备份按钮.设置禁用(true)
            splitLog.日志组件.添加日志('开始备份数据库...')
            try {
              await API管理器.请求postJson并处理错误(
                '/api/admin-sqlite/backup-database',
                {},
                async (data: { message: string }) => {
                  splitLog.日志组件.添加日志(data.message)
                },
              )
              splitLog.日志组件.添加日志('备份成功')
            } catch (错误) {
              console.error('备份数据库失败:', 错误)
              splitLog.日志组件.添加日志(`备份失败: ${错误}`)
            } finally {
              开始备份按钮.设置禁用(false)
            }
          },
        })

        左侧内容.appendChild(开始备份按钮)
        splitLog.appendChild(左侧内容)

        显示模态框({ 标题: '备份数据库' }, splitLog)
      },
    })

    this.shadow.appendChild(标题)
    this.shadow.appendChild(备份按钮)
  }
}
