import { 组件基类 } from '../../base/base'
import { 创建元素 } from '../../global/tools/create-element'
import { 横向tab组件 } from '../general/tabs/tabs-horizontal'
import { 纵向tab组件 } from '../general/tabs/tabs-vertical'

// 业务组件
import { 演示跳转组件 } from '../demo/to-demo'
import { 软件版本组件 } from '../general/version'
import { 用户设置组件 } from './user/settings'
import { 用户信息组件 } from './user/user-profile'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 首页组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-index', this)
  }

  protected override async 当加载时(): Promise<void> {
    // 布局
    let tabs = new 横向tab组件()

    // 开始标签页
    let 开始容器 = 创建元素('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
      },
    })
    开始容器.append(创建元素('div', { textContent: '你好世界' }))
    tabs.添加标签页({ 标签: '开始' }, 开始容器)

    // 演示标签页
    let 演示容器 = 创建元素('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
      },
    })
    演示容器.append(new 演示跳转组件())
    tabs.添加标签页({ 标签: '演示' }, 演示容器)

    // 系统标签页
    let 系统容器 = 创建元素('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
      },
    })
    let vTabs = new 纵向tab组件()

    // 设置
    let 设置容器 = 创建元素('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
      },
    })
    设置容器.append(new 用户设置组件())
    vTabs.添加标签页({ 标签: '设置' }, 设置容器)

    // 用户
    let 用户容器 = 创建元素('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
      },
    })
    用户容器.append(new 用户信息组件())
    vTabs.添加标签页({ 标签: '用户' }, 用户容器)

    // 关于
    let 关于容器 = 创建元素('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
      },
    })
    关于容器.append(new 软件版本组件())
    vTabs.添加标签页({ 标签: '关于' }, 关于容器)

    系统容器.append(vTabs)
    tabs.添加标签页({ 标签: '系统' }, 系统容器)

    this.shadow.append(tabs)
  }
}
