import { 组件基类 } from '../../base/base'
import { 信息提示, 成功提示, 警告提示, 错误提示 } from '../../global/manager/toast-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 主要按钮, 危险按钮, 成功按钮, 普通按钮, 警告按钮 } from '../general/base/base-button'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 演示吐司消息组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-toast-demo', this)
  }

  protected override async 当加载时(): Promise<void> {
    let 容器 = 创建元素('div', {
      style: { display: 'flex', flexDirection: 'column', gap: 'var(--间距-4)', width: '100%' },
    })
    let 消息类型按钮组 = this.创建按钮组('消息类型')
    let 组合场景按钮组 = this.创建按钮组('组合场景')

    let 成功按钮实例 = new 成功按钮({
      文本: '显示成功消息',
      宿主样式: { width: '100%' },
      点击处理函数: async (): Promise<void> => {
        成功提示('操作成功完成!')
      },
    })

    let 错误按钮实例 = new 危险按钮({
      文本: '显示错误消息',
      宿主样式: { width: '100%' },
      点击处理函数: async (): Promise<void> => {
        错误提示('发生了一个错误!')
      },
    })

    let 警告按钮实例 = new 警告按钮({
      文本: '显示警告消息',
      宿主样式: { width: '100%' },
      点击处理函数: async (): Promise<void> => {
        警告提示('这是一个警告提示!')
      },
    })

    let 信息按钮实例 = new 普通按钮({
      文本: '显示信息消息',
      宿主样式: { width: '100%' },
      点击处理函数: async (): Promise<void> => {
        信息提示('这是一条普通信息')
      },
    })

    let 长文本按钮实例 = new 普通按钮({
      文本: '显示长文本消息',
      宿主样式: { width: '100%' },
      点击处理函数: async (): Promise<void> => {
        信息提示('这是一条很长很长的消息,用来测试吐司组件在处理长文本时的表现是否正常,看看会不会换行或者溢出。')
      },
    })

    let 自定义时长按钮实例 = new 主要按钮({
      文本: '显示自定义时长消息(5秒)',
      宿主样式: { width: '100%' },
      点击处理函数: async (): Promise<void> => {
        成功提示('这条消息会显示5秒钟', 5000)
      },
    })

    let 多个吐司按钮实例 = new 主要按钮({
      文本: '连续显示多个吐司',
      宿主样式: { width: '100%' },
      点击处理函数: async (): Promise<void> => {
        成功提示('第一条消息')
        警告提示('第二条消息')
        错误提示('第三条消息')
        信息提示('第四条消息')
      },
    })

    消息类型按钮组.按钮区.append(成功按钮实例, 错误按钮实例, 警告按钮实例, 信息按钮实例)
    组合场景按钮组.按钮区.append(长文本按钮实例, 自定义时长按钮实例, 多个吐司按钮实例)
    容器.append(消息类型按钮组.容器, 组合场景按钮组.容器)

    this.shadow.appendChild(容器)
  }

  private 创建按钮组(标题: string): { 容器: HTMLElement; 按钮区: HTMLDivElement } {
    let 容器 = 创建元素('section', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--间距-2)' } })
    let 按钮区 = 创建元素('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
        gap: 'var(--间距-2)',
      },
    })
    容器.append(创建元素('h3', { textContent: 标题, style: { margin: '0', fontSize: 'var(--字号-正文)' } }), 按钮区)
    return { 容器, 按钮区 }
  }
}
