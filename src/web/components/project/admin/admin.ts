import { 组件基类 } from '../../../base/base'
import { 创建元素 } from '../../../global/tools/create-element'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 管理中心页面组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-admin', this)
  }

  protected override async 当加载时(): Promise<void> {
    let 容器 = 创建元素('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '20px',
        backgroundColor: 'var(--背景颜色)',
      },
    })

    容器.append(创建元素('h1', { textContent: '管理中心', style: { color: 'var(--文字颜色)', margin: '0' } }))

    let 按钮容器 = 创建元素('div', { style: { display: 'flex', gap: '20px' } })

    let 菜单项 = [
      { 文本: '数据库管理', 链接: 'admin-sqlite.html' },
      { 文本: '任务管理', 链接: 'admin-job.html' },
      { 文本: '日志管理', 链接: 'admin-log.html' },
    ]

    for (let 项 of 菜单项) {
      let a = 创建元素('a', { href: 项.链接, target: '_blank', style: { textDecoration: 'none' } })
      let 按钮 = 创建元素('button', {
        textContent: 项.文本,
        style: {
          padding: '20px 40px',
          fontSize: '18px',
          backgroundColor: 'var(--主色调)',
          color: 'var(--主色调文字)',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px var(--深阴影颜色)',
        },
      })
      a.append(按钮)
      按钮容器.append(a)
    }

    容器.append(按钮容器)
    this.shadow.append(容器)
  }
}
