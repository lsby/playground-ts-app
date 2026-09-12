import { 组件基类 } from '../../base/base'
import { 主题管理器 } from '../../global/manager/theme-manager'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 设置主题组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-set-theme', this)
  }

  public constructor(配置?: { 从数据库加载?: boolean }) {
    super()
    if (配置?.从数据库加载 !== undefined) {
      this.setAttribute('从数据库加载', String(配置.从数据库加载))
    }
  }

  protected override async 当加载时(): Promise<void> {
    let 从数据库加载属性 = this.getAttribute('从数据库加载')
    let 从数据库加载 = 从数据库加载属性 !== 'false'
    await 主题管理器.初始化(从数据库加载)
  }
}
