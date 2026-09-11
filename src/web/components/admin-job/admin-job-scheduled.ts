import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 显示模态框 } from '../../global/manager/modal-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 普通按钮 } from '../general/base/base-button'
import { 日志组件 } from '../general/log/log'
import { 表格组件 } from '../general/table/table'
import { 数据表加载数据参数 } from '../general/table/types'

type 发出事件类型 = {}
type 监听事件类型 = {}
type 定时任务数据项 = {
  id: string
  名称: string
  表达式: string
  状态: string
  下次执行时间: string | null
  最后执行时间: string | null
  执行次数: number
}

export class 定时任务管理组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-admin-job-scheduled', this)
  }

  private 数据表格组件: 表格组件<定时任务数据项>
  private 所有任务数据: 定时任务数据项[] = []
  private 当前任务详情WS: WebSocket | null = null

  public constructor() {
    super()
    this.数据表格组件 = new 表格组件({
      行键: (数据项): string => 数据项.id,
      列配置: [
        { 字段名: '名称', 显示名: '任务名称', 可排序: true },
        { 字段名: '表达式', 显示名: 'Cron 表达式', 可排序: true },
        { 字段名: '状态', 显示名: '状态', 可排序: true },
        { 字段名: '下次执行时间', 显示名: '下次执行时间', 可排序: true },
        { 字段名: '最后执行时间', 显示名: '最后执行时间', 可排序: true },
        { 字段名: '执行次数', 显示名: '执行次数', 可排序: true },
      ],
      操作列表: [
        {
          名称: '详情',
          回调: async (任务: 定时任务数据项): Promise<void> => {
            await this.显示任务详情(任务)
          },
        },
        {
          名称: '手动触发',
          回调: async (任务: 定时任务数据项): Promise<void> => {
            try {
              await API管理器.请求postJson并处理错误('/api/admin-job/scheduled/manual-trigger', { 任务id: 任务.id })
              await this.刷新任务列表()
            } catch (错误) {
              console.error('手动触发任务失败:', 错误)
            }
          },
        },
      ],
      每页数量: 10,
      加载数据: this.创建加载数据函数(),
    })
  }

  private 创建加载数据函数(): (
    参数: 数据表加载数据参数<定时任务数据项>,
  ) => Promise<{ 数据: 定时任务数据项[]; 总数: number }> {
    return async (参数: 数据表加载数据参数<定时任务数据项>) => {
      let 数据 = this.所有任务数据

      // 应用筛选
      {
        for (let [key, value] of Object.entries(参数.筛选条件)) {
          if (value !== '') {
            数据 = 数据.filter((项) =>
              String(项[key as keyof 定时任务数据项])
                .toLowerCase()
                .includes(value.toLowerCase()),
            )
          }
        }
      }

      // 应用排序
      if (参数.排序列表.length > 0) {
        let 排序项 = 参数.排序列表[0]
        if (排序项 !== undefined) {
          数据 = [...数据].sort((a, b) => {
            let a值 = a[排序项.field]
            let b值 = b[排序项.field]
            if (typeof a值 === 'string' && typeof b值 === 'string') {
              let 比较 = a值.localeCompare(b值)
              return 排序项.direction === 'asc' ? 比较 : -比较
            }
            if (typeof a值 === 'number' && typeof b值 === 'number') {
              return 排序项.direction === 'asc' ? a值 - b值 : b值 - a值
            }
            return 0
          })
        }
      }

      let 总数 = 数据.length
      let 开始索引 = (参数.页码 - 1) * 参数.每页数量
      let 结束索引 = 开始索引 + 参数.每页数量
      let 分页数据 = 数据.slice(开始索引, 结束索引)

      return { 数据: 分页数据, 总数 }
    }
  }

  private async 刷新任务列表(信号?: AbortSignal): Promise<void> {
    try {
      let 结果 = await API管理器.请求postJson并处理错误(
        '/api/admin-job/scheduled/list',
        {},
        信号 === undefined ? undefined : { 信号 },
      )
      this.所有任务数据 = 结果.任务列表.map((任务) => ({
        id: 任务.id,
        名称: 任务.名称,
        表达式: 任务.表达式,
        状态: 任务.状态,
        下次执行时间: 任务.下次执行时间 !== null ? new Date(任务.下次执行时间).toLocaleString() : null,
        最后执行时间: 任务.最后执行时间 !== null ? new Date(任务.最后执行时间).toLocaleString() : null,
        执行次数: 任务.执行次数,
      }))

      await this.数据表格组件.刷新数据()
    } catch (错误) {
      if (信号?.aborted === true) throw 错误
      console.error('获取定时任务列表失败:', 错误)
    }
  }

  private async 显示任务详情(任务: 定时任务数据项): Promise<void> {
    // 更新 URL
    window.history.pushState(null, '', `?type=scheduled&id=${任务.id}`)

    // 创建详情内容容器
    let 详情内容 = 创建元素('div', { style: { height: '100%' } })

    // 创建日志组件
    let 日志组件实例 = new 日志组件()
    日志组件实例.style.height = '100%'
    日志组件实例.style.width = '100%'

    // 更新日志显示的函数
    let 更新日志显示 = (日志: { 时间: number; 消息: string }): void => {
      let 日志消息 = `[${new Date(日志.时间).toLocaleString()}] ${日志.消息}`
      日志组件实例.添加日志(日志消息)
    }

    详情内容.appendChild(日志组件实例)

    // 标志：历史日志是否已加载
    let 历史日志已加载 = false
    // 缓存：在历史日志加载前收到的WS数据
    let ws数据缓存: { 时间: number; 消息: string }[] = []

    // 显示模态框
    await 显示模态框(
      {
        标题: '定时任务详情',
        最大化: true,
        关闭回调: async () => {
          // 清除 URL 中的 id 参数
          let url = new URL(window.location.href)
          url.searchParams.delete('id')
          window.history.replaceState(null, '', url.pathname + url.search)

          if (this.当前任务详情WS !== null) {
            this.当前任务详情WS.close()
            this.当前任务详情WS = null
          }
        },
      },
      详情内容,
    )

    // 组件已挂载到DOM，现在设置加载状态
    日志组件实例.设置加载状态(true)

    // 直接用一个请求同时获取历史日志并建立WebSocket连接
    API管理器.请求postJson并处理错误(
      '/api/admin-job/scheduled/get-logs',
      { 任务id: 任务.id },
      async (ws数据) => {
        // 收到WebSocket消息
        if (历史日志已加载 === true) {
          // 历史日志已加载，直接显示
          更新日志显示(ws数据.新日志)
        } else {
          // 历史日志未加载，缓存WS数据
          ws数据缓存.push(ws数据.新日志)
        }
      },
      async (_, ws) => {
        // WS连接成功时存储WS对象
        this.当前任务详情WS = ws
      },
    )
      .then((结果) => {
        // 显示历史日志
        结果.日志列表.forEach((日志) => {
          更新日志显示(日志)
        })
        // 显示缓存的WS数据
        ws数据缓存.forEach((日志) => {
          更新日志显示(日志)
        })
        // 清空缓存
        ws数据缓存 = []
        // 标记历史日志已加载
        历史日志已加载 = true
        // 隐藏加载状态
        日志组件实例.设置加载状态(false)
      })
      .catch((错误) => {
        console.error('获取定时任务日志失败:', 错误)
        // 即使出错也要隐藏加载状态
        日志组件实例.设置加载状态(false)
      })
  }

  protected override async 当加载时(): Promise<void> {
    this.获得宿主样式().width = '100%'

    let 主容器 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', padding: '16px', gap: '16px' } })

    // 顶部操作区
    let 操作区 = 创建元素('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } })

    let 刷新按钮 = new 普通按钮({
      文本: '刷新',
      点击处理函数: async (): Promise<void> => {
        await this.刷新任务列表()
      },
    })
    操作区.appendChild(刷新按钮)

    主容器.appendChild(操作区)
    主容器.appendChild(this.数据表格组件)

    this.shadow.appendChild(主容器)

    // 初始加载数据
    await this.刷新任务列表(this.渲染信号)

    // 检查 URL 参数，如果有 type=scheduled 和 id，自动显示详情
    let urlParams = new URLSearchParams(window.location.search)
    let type = urlParams.get('type')
    let id = urlParams.get('id')
    if (type === 'scheduled' && id !== null) {
      let 任务 = this.所有任务数据.find((任务) => 任务.id === id)
      if (任务 !== undefined) {
        await this.显示任务详情(任务)
      }
    }
  }
}
