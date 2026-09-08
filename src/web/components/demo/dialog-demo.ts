import { 组件基类 } from '../../base/base'
import { 显示对话框, 显示确认对话框, 显示输入对话框 } from '../../global/manager/dialog-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 普通按钮 } from '../general/base/base-button'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 演示对话框组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-dialog-demo', this)
  }

  protected override async 当加载时(): Promise<void> {
    let 容器 = 创建元素('div', {
      style: { display: 'flex', flexDirection: 'column', gap: 'var(--间距-3)', width: '100%' },
    })

    let 标题 = 创建元素('h3', { textContent: '对话框演示', style: { margin: '0' } })
    let 描述 = 创建元素('p', {
      textContent: '消息、确认与输入对话框的常见组合。',
      style: { margin: '0', color: 'var(--次要文字颜色)' },
    })
    let 按钮区 = 创建元素('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--间距-2)' } })

    let 简单对话框按钮 = new 普通按钮({
      文本: '显示简单对话框',
      点击处理函数: async (): Promise<void> => {
        await 显示对话框('这是一个简单的对话框消息。')
      },
    })

    let 长文本对话框按钮 = new 普通按钮({
      文本: '显示长文本对话框',
      点击处理函数: async (): Promise<void> => {
        await 显示对话框(
          '这是一条很长很长的消息，用来测试对话框在处理长文本时的表现是否正常，看看会不会换行或者溢出。这是一条很长很长的消息，用来测试对话框在处理长文本时的表现是否正常，看看会不会换行或者溢出。',
        )
      },
    })

    let 确认对话框按钮 = new 普通按钮({
      文本: '显示确认对话框',
      点击处理函数: async (): Promise<void> => {
        let 结果 = await 显示确认对话框('您确定要执行此操作吗？')
        if (结果 === true) {
          await 显示确认对话框('用户选择了确定')
        } else {
          await 显示确认对话框('用户选择了取消')
        }
      },
    })

    let 确认对话框带长文本按钮 = new 普通按钮({
      文本: '显示长文本确认对话框',
      点击处理函数: async (): Promise<void> => {
        let 结果 = await 显示确认对话框(
          '这是一个很长的确认消息，用来测试确认对话框在处理长文本时的表现是否正常。这是一个很长的确认消息，用来测试确认对话框在处理长文本时的表现是否正常。',
        )
        if (结果 === true) {
          await 显示确认对话框('用户选择了确定')
        } else {
          await 显示确认对话框('用户选择了取消')
        }
      },
    })

    let 多个对话框按钮 = new 普通按钮({
      文本: '连续显示多个对话框',
      点击处理函数: async (): Promise<void> => {
        await 显示对话框('第一个对话框')
        let 结果 = await 显示确认对话框('第二个对话框，是否继续？')
        if (结果 === true) {
          await 显示对话框('操作继续')
        } else {
          await 显示对话框('操作取消')
        }
      },
    })

    let 输入对话框按钮 = new 普通按钮({
      文本: '显示输入对话框',
      点击处理函数: async (): Promise<void> => {
        let 结果 = await 显示输入对话框('请输入您的姓名：')
        if (结果 !== null) {
          await 显示对话框(`您输入的姓名是：${结果}`)
        } else {
          await 显示对话框('您取消了输入')
        }
      },
    })

    let 输入对话框带默认值按钮 = new 普通按钮({
      文本: '显示带默认值的输入对话框',
      点击处理函数: async (): Promise<void> => {
        let 结果 = await 显示输入对话框('请输入您的年龄：', '25')
        if (结果 !== null) {
          await 显示对话框(`您输入的年龄是：${结果}`)
        } else {
          await 显示对话框('您取消了输入')
        }
      },
    })

    let 长消息输入对话框按钮 = new 普通按钮({
      文本: '显示长消息输入对话框',
      点击处理函数: async (): Promise<void> => {
        let 结果 = await 显示输入对话框(
          '这是一个很长的提示消息，用来测试输入对话框在处理长文本提示时的表现是否正常。这是一个很长的提示消息，用来测试输入对话框在处理长文本提示时的表现是否正常。',
        )
        if (结果 !== null) {
          await 显示对话框(`您输入的内容是：${结果}`)
        } else {
          await 显示对话框('您取消了输入')
        }
      },
    })

    按钮区.append(
      简单对话框按钮,
      长文本对话框按钮,
      确认对话框按钮,
      确认对话框带长文本按钮,
      多个对话框按钮,
      输入对话框按钮,
      输入对话框带默认值按钮,
      长消息输入对话框按钮,
    )
    容器.append(标题, 描述, 按钮区)

    this.获得宿主样式().display = 'block'
    this.获得宿主样式().width = '100%'
    this.shadow.append(容器)
  }
}
