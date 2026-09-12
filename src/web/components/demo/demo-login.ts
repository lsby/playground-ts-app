import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 主要按钮 } from '../general/base/base-button'
import { 表单 } from '../general/form/form'
import { 密码输入框, 普通输入框 } from '../general/form/form-input'

type 登录数据 = { username: string; password: string }
type 发出事件类型 = {}
type 监听事件类型 = {}

export class 演示登录组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-demo-login', this)
  }

  protected override 当加载时(): void {
    let 用户名 = new 普通输入框({ 占位符: '输入演示账号', 自动完成: 'username' })
    let 密码 = new 密码输入框({ 占位符: '输入密码', 自动完成: 'current-password' })
    let 表单实例 = new 表单<登录数据>({
      项列表: [
        { 键: 'username', 标签: '用户名', 组件: 用户名, 宽度: 2, 必填: true },
        { 键: 'password', 标签: '密码', 组件: 密码, 宽度: 2, 必填: true },
      ],
    })
    let 结果 = 创建元素('div', { role: 'alert', style: { minHeight: '22px', color: 'var(--错误前景)' } })
    let 登录 = async (): Promise<void> => {
      结果.textContent = ''
      await 表单实例.提交(async (数据): Promise<void> => {
        try {
          let 响应 = await API管理器.请求postJson并处理错误('/api/demo/auth/login', {
            userName: 数据.username,
            userPassword: 数据.password,
          })
          API管理器.设置token(响应.token)
          window.location.assign('/demo/index.html')
        } catch (错误) {
          结果.textContent = 错误 instanceof Error ? 错误.message : '登录失败'
        }
      })
    }
    密码.监听发出事件('回车', 登录)
    let 卡片 = 创建元素('section', {
      style: {
        width: 'min(420px, calc(100vw - 32px))',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--间距-4)',
        padding: 'var(--间距-6)',
        border: '1px solid var(--边框颜色)',
        borderRadius: 'var(--圆角-大)',
        backgroundColor: 'var(--卡片背景颜色)',
        boxShadow: 'var(--浅阴影)',
        boxSizing: 'border-box',
      },
    })
    卡片.append(
      创建元素('h1', { textContent: '模板功能演示', style: { margin: '0', fontSize: '24px' } }),
      创建元素('p', { textContent: '需要登录', style: { margin: '0', color: 'var(--次要文字颜色)' } }),
      表单实例,
      结果,
      new 主要按钮({
        文本: '登录演示系统',
        宿主样式: { width: '100%' },
        元素样式: { width: '100%' },
        点击处理函数: 登录,
      }),
    )
    this.获得宿主样式().display = 'block'
    this.shadow.append(卡片)
  }
}
