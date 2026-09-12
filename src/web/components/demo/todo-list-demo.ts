import { 组件基类 } from '../../base/base'
import { 创建元素 } from '../../global/tools/create-element'
import { 主要按钮, 文本按钮 } from '../general/base/base-button'
import { 创建图标 } from '../general/base/icon'
import { 普通输入框 } from '../general/form/form-input'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 演示todo组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-todo-list-demo', this)
  }

  private 添加任务 = (): void => {
    let 内容 = this.输入框.获得值().trim()
    if (内容 === '') return
    this.todo列表.push(内容)
    this.输入框.设置值('')
    this.刷新列表()
  }
  private 输入框 = new 普通输入框({
    占位符: '请输入任务内容',
    元素样式: { padding: '0.5em', fontSize: '1em', borderColor: 'var(--边框颜色)' },
  })
  private 添加按钮 = new 主要按钮({
    文本: '添加任务',
    点击处理函数: (): void => {
      this.添加任务()
    },
  })
  private 列表容器 = 创建元素('ul')
  private todo列表: string[] = []

  public constructor() {
    super()
    this.输入框.监听发出事件('回车', (): void => this.添加任务())
  }

  private 刷新列表(): void {
    this.列表容器.innerHTML = ''
    this.todo列表.forEach((任务内容, index) => {
      let li = 创建元素('li', {
        textContent: 任务内容,
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.5em',
          marginBottom: '0.5em',
          border: '1px solid var(--边框颜色)',
          borderRadius: '4px',
        },
      })

      let 删除按钮 = new 文本按钮({
        标题: '删除任务',
        图标: 创建图标('close'),
        元素样式: { background: 'transparent', border: 'none', color: 'red', fontSize: '1.2em', cursor: 'pointer' },
        点击处理函数: (): void => {
          this.todo列表.splice(index, 1)
          this.刷新列表()
        },
      })

      li.appendChild(删除按钮)
      this.列表容器.appendChild(li)
    })
  }

  protected override async 当加载时(): Promise<void> {
    // ===== 布局容器 =====
    let 主容器 = 创建元素('div', {
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
    let 列布局 = 创建元素('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
      },
    })
    let 输入行 = 创建元素('div', {
      style: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
      },
    })

    // ===== 列表容器样=====
    this.列表容器.style.listStyle = 'none'
    this.列表容器.style.padding = '0'
    this.列表容器.style.marginTop = '1em'
    this.列表容器.style.width = '100%'

    // ===== 组装 =====
    输入行.append(this.输入框, this.添加按钮)
    列布局.append(输入行, this.列表容器)
    主容器.append(列布局)

    // ===== 挂载 =====
    this.shadow.append(主容器)

    this.刷新列表()
  }
}
