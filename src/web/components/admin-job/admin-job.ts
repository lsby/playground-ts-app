import { 组件基类 } from '../../base/base'
import { tabHorizontal发出事件类型, 横向tab组件 } from '../general/tabs/tabs-horizontal'
import { 即时任务管理组件 } from './admin-job-instant'
import { 定时任务管理组件 } from './admin-job-scheduled'

type 发出事件类型 = {}
type 监听事件类型 = {} & tabHorizontal发出事件类型

export class 任务管理页面组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-admin-job', this)
  }

  private tabs = new 横向tab组件()
  private 即时任务组件 = new 即时任务管理组件()
  private 定时任务组件 = new 定时任务管理组件()

  public constructor() {
    super()
    this.tabs.添加标签页({ 标签: '即时任务' }, this.即时任务组件)
    this.tabs.添加标签页({ 标签: '定时任务' }, this.定时任务组件)
  }

  protected override async 当加载时(): Promise<void> {
    this.获得宿主样式().width = '100%'
    this.获得宿主样式().height = '100%'

    this.监听冒泡事件('切换', async (e: CustomEvent<{ 当前索引: number }>) => {
      if (e.composedPath()[0] !== this.tabs) return
      let type = e.detail.当前索引 === 0 ? 'instant' : 'scheduled'
      let url = new URL(window.location.href)
      url.searchParams.set('type', type)
      window.history.replaceState(null, '', url.pathname + url.search)
    })

    this.shadow.appendChild(this.tabs)

    // 检查 URL 参数，设置初始索引
    let urlParams = new URLSearchParams(window.location.search)
    let type = urlParams.get('type')
    if (type === 'scheduled') {
      void this.tabs.设置当前索引(1)
    }
  }
}
