import { 环境变量 } from '../../../../global/env'
import { 组件基类 } from '../../../base/base'
import { API管理器 } from '../../../global/manager/api-manager'
import { 创建元素 } from '../../../global/tools/create-element'
import { 主要按钮, 文本按钮, 链接按钮 } from '../../general/base/base-button'
import { 表单 } from '../../general/form/form'
import { 密码输入框, 普通输入框 } from '../../general/form/form-input'

type 登录数据 = { username: string; password: string }
type 注册数据 = { username: string; password: string; confirmPassword: string }
type 发出事件类型 = {}
type 监听事件类型 = {}
type 认证模式 = 'login' | 'register'

export class 登录组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-login', this)
  }

  protected override async 当加载时(): Promise<void> {
    let 允许注册 = await this.获得允许注册()
    let 模式: 认证模式 =
      允许注册 === true && new URLSearchParams(window.location.search).get('register') === 'true' ? 'register' : 'login'
    let 登录用户名 = new 普通输入框({ 占位符: '请输入用户名', 自动完成: 'username' })
    let 登录密码 = new 密码输入框({ 占位符: '请输入密码', 自动完成: 'current-password' })
    let 登录表单 = new 表单<登录数据>({
      项列表: [
        { 键: 'username', 标签: '用户名', 组件: 登录用户名, 宽度: 2, 必填: true },
        { 键: 'password', 标签: '密码', 组件: 登录密码, 宽度: 2, 必填: true },
      ],
    })
    let 注册用户名 = new 普通输入框({ 占位符: '请输入用户名', 自动完成: 'username' })
    let 注册密码 = new 密码输入框({ 占位符: '请输入密码', 自动完成: 'new-password' })
    let 确认密码 = new 密码输入框({ 占位符: '请再次输入密码', 自动完成: 'new-password' })
    let 注册表单 = new 表单<注册数据>({
      项列表: [
        { 键: 'username', 标签: '用户名', 组件: 注册用户名, 宽度: 2, 必填: true },
        { 键: 'password', 标签: '密码', 组件: 注册密码, 宽度: 2, 必填: true },
        {
          键: 'confirmPassword',
          标签: '确认密码',
          组件: 确认密码,
          宽度: 2,
          必填: true,
          校验器们: [(值, 数据): string | null => (值 === 数据.password ? null : '两次输入的密码不一致')],
        },
      ],
    })
    let 登录表单容器 = 创建元素('div')
    let 注册表单容器 = 创建元素('div')
    登录表单容器.append(登录表单)
    注册表单容器.append(注册表单)
    let 结果 = 创建元素('div', { role: 'alert', style: { minHeight: '22px', color: 'var(--错误颜色)' } })
    let 标题 = 创建元素('h1', { style: { margin: '0' } })

    let 执行登录 = async (): Promise<void> => {
      结果.textContent = ''
      结果.style.color = 'var(--错误颜色)'
      try {
        await 登录表单.提交(async (数据): Promise<void> => {
          let 响应 = await API管理器.请求postJson并处理错误('/api/project/login', {
            userName: 数据.username,
            userPassword: 数据.password,
          })
          API管理器.设置token(响应.token)
          window.location.assign(this.获得安全重定向())
        })
      } catch (错误) {
        结果.textContent = 错误 instanceof Error ? 错误.message : '登录失败'
      }
    }
    let 执行注册 = async (): Promise<void> => {
      结果.textContent = ''
      结果.style.color = 'var(--错误颜色)'
      try {
        let 成功 = await 注册表单.提交(async (数据): Promise<void> => {
          await API管理器.请求postJson并处理错误('/api/project/register', {
            userName: 数据.username,
            userPassword: 数据.password,
          })
        })
        if (成功 === false) return
        结果.style.color = 'var(--成功颜色)'
        结果.textContent = '注册成功，请登录'
        登录用户名.设置值(注册用户名.获得值())
        模式 = 'login'
        更新模式()
      } catch (错误) {
        结果.textContent = 错误 instanceof Error ? 错误.message : '注册失败'
      }
    }
    let 登录按钮 = new 主要按钮({
      文本: '登录',
      宿主样式: { width: '100%' },
      元素样式: { width: '100%' },
      点击处理函数: 执行登录,
    })
    let 注册按钮 = new 主要按钮({
      文本: '注册',
      宿主样式: { width: '100%' },
      元素样式: { width: '100%' },
      点击处理函数: 执行注册,
    })
    let 切换按钮 = new 链接按钮({
      点击处理函数: (): void => {
        模式 = 模式 === 'login' ? 'register' : 'login'
        结果.textContent = ''
        更新模式()
      },
    })
    let 更新模式 = (): void => {
      let 注册模式 = 模式 === 'register'
      标题.textContent = 注册模式 ? '注册' : '登录'
      登录表单容器.style.display = 注册模式 ? 'none' : 'block'
      注册表单容器.style.display = 注册模式 ? 'block' : 'none'
      登录按钮.获得宿主样式().display = 注册模式 ? 'none' : 'block'
      注册按钮.获得宿主样式().display = 注册模式 ? 'block' : 'none'
      切换按钮.设置文本(注册模式 ? '已经有账号？立即登录' : '还没有账号？立即注册')
      let url = new URL(window.location.href)
      if (注册模式) url.searchParams.set('register', 'true')
      else url.searchParams.delete('register')
      window.history.replaceState(null, '', url)
    }
    登录密码.监听发出事件('回车', 执行登录)
    确认密码.监听发出事件('回车', 执行注册)

    let 卡片 = 创建元素('section', {
      style: {
        width: 'min(400px, calc(100vw - 32px))',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--间距-4)',
        padding: 'var(--间距-6)',
        boxSizing: 'border-box',
        border: '1px solid var(--边框颜色)',
        borderRadius: 'var(--圆角-大)',
        backgroundColor: 'var(--卡片背景颜色)',
        boxShadow: 'var(--浅阴影)',
      },
    })
    卡片.append(标题, 登录表单容器, 注册表单容器, 结果, 登录按钮, 注册按钮)
    if (允许注册 === true) 卡片.append(切换按钮)
    if (环境变量.BUILD_TARGET === 'pure-frontend')
      卡片.append(
        new 文本按钮({
          文本: '重设本机管理员密码',
          点击处理函数: async (): Promise<void> => await this.重设本机密码(结果),
        }),
      )
    this.shadow.append(卡片)
    更新模式()
  }

  private async 获得允许注册(): Promise<boolean> {
    try {
      let 响应 = await API管理器.请求postJson并处理错误('/api/system/get-enable-registration', {})
      return 响应.enable_register
    } catch {
      return false
    }
  }

  private 获得安全重定向(): string {
    let 目标 = new URLSearchParams(window.location.search).get('redirect') ?? '/index.html'
    try {
      let url = new URL(目标, window.location.origin)
      return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : '/index.html'
    } catch {
      return '/index.html'
    }
  }

  private async 重设本机密码(结果: HTMLElement): Promise<void> {
    let 密码 = window.prompt('请输入新的本机管理员密码')
    if (密码 === null) return
    let 确认密码 = window.prompt('请再次输入新的本机管理员密码')
    if (确认密码 === null) return
    if (密码 !== 确认密码) {
      结果.textContent = '两次输入的密码不一致'
      return
    }
    try {
      await API管理器.重置纯前端管理员密码(密码)
      结果.style.color = 'var(--成功颜色)'
      结果.textContent = '密码已重设'
    } catch (错误) {
      结果.style.color = 'var(--错误颜色)'
      结果.textContent = 错误 instanceof Error ? 错误.message : '重设失败'
    }
  }
}
