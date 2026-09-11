import { 环境变量 } from '../../../../global/env'
import { 组件基类 } from '../../../base/base'
import { API管理器 } from '../../../global/manager/api-manager'
import { 显示对话框, 显示确认对话框 } from '../../../global/manager/dialog-manager'
import { 主题管理器 } from '../../../global/manager/theme-manager'
import { 成功提示 } from '../../../global/manager/toast-manager'
import { 创建元素 } from '../../../global/tools/create-element'
import { 主要按钮, 危险按钮 } from '../../general/base/base-button'
import { 卡片组件 } from '../../general/base/card'
import { 表单 } from '../../general/form/form'
import { 复选框 } from '../../general/form/form-checkbox'
import { 单选框组 } from '../../general/form/form-radio-group'

type 设置事件 = {}
type 监听设置事件 = {}

type 系统配置数据 = {
  id: string
  enable_register: boolean
  enable_get_interface_type: boolean
  is_initialized: boolean
}
type 用户配置数据 = { id: string; theme: '系统' | '亮色' | '暗色' }
type 系统配置表单数据 = Pick<系统配置数据, 'enable_register' | 'enable_get_interface_type'>
type 用户配置表单数据 = Pick<用户配置数据, 'theme'>

export class 用户设置组件 extends 组件基类<设置事件, 监听设置事件> {
  private 用户信息?: { id: string; name: string; is_admin: boolean }
  private 系统配置表单?: 表单<系统配置表单数据>
  private 用户配置表单?: 表单<用户配置表单数据>

  static {
    this.注册组件('lsby-settings', this)
  }

  public constructor() {
    super()
  }

  protected async 当加载时(): Promise<void> {
    // 获取用户信息
    let 结果 = await API管理器.请求postJson('/api/user/get-user-info', {}, { 信号: this.渲染信号 })
    if (结果.status !== 'success') {
      return
    }
    this.用户信息 = 结果.data

    let 容器 = 创建元素('div', { style: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' } })

    if (this.用户信息.is_admin) {
      let 系统保存按钮 = new 主要按钮({
        文本: '保存配置',
        点击处理函数: async (): Promise<void> => await this.保存系统配置(),
      })
      this.系统配置表单 = this.创建系统配置表单()
      容器.append(new 卡片组件({ 标题: '系统配置', 操作区: 系统保存按钮, 内容: this.系统配置表单 }))
    }

    let 用户保存按钮 = new 主要按钮({
      文本: '保存配置',
      点击处理函数: async (): Promise<void> => await this.保存用户配置(),
    })
    this.用户配置表单 = this.创建用户配置表单()
    容器.append(new 卡片组件({ 标题: '用户配置', 操作区: 用户保存按钮, 内容: this.用户配置表单 }))

    if (this.用户信息.is_admin) {
      let 重置按钮 = new 危险按钮({
        文本: '彻底重置并初始化',
        点击处理函数: async (): Promise<void> => {
          let 确认 = await 显示确认对话框(
            '【严重警告】此操作将清空数据库所有业务数据并恢复至初始状态，且不可逆！确认继续吗？',
          )
          if (确认 === true) {
            if (环境变量.BUILD_TARGET === 'pure-frontend') {
              await API管理器.重置纯前端数据库()
              API管理器.清除token()
              await 显示对话框('本机数据库已彻底清除并重新初始化。请在登录页重设管理员密码后登录。')
              window.location.href = '/login.html'
              return
            }
            let 结果 = await API管理器.请求postJson('/api/system/reset-database', {})
            if (结果.status === 'success') {
              await 显示对话框(
                '数据库重置成功！即将跳转到登录页。请在服务端控制台查看新生成的管理员密码（如果你没有配置固定默认密码的话）。',
              )
              window.location.href = '/index.html'
            } else {
              await 显示对话框(`重置失败: ${结果.data}`)
            }
          }
        },
      })
      let 警告文字 = 创建元素('div', {
        textContent:
          '警告：点击上方按钮将暴力删除所有表中的数据（包括你现在的账号密码），并重新执行初始化脚本。如果你没有配置 DEFAULT_SYSTEM_PWD，请务必准备好查看控制台输出的新密码。',
        style: { color: 'var(--文字颜色)', fontSize: 'var(--字号-正文)' },
      })
      容器.append(new 卡片组件({ 标题: '系统重置', 强调: '危险', 操作区: 重置按钮, 内容: 警告文字 }))
    }

    this.shadow.appendChild(容器)

    // 加载数据
    await this.加载数据(this.渲染信号)
  }

  private 创建系统配置表单(): 表单<系统配置表单数据> {
    let 表单实例 = new 表单<系统配置表单数据>({
      项列表: [
        { 键: 'enable_register', 组件: new 复选框({ 标签: '启用注册' }), 宽度: 1 },
        { 键: 'enable_get_interface_type', 组件: new 复选框({ 标签: '启用获取接口类型' }), 宽度: 1 },
      ],
      元素样式: { gridTemplateColumns: '1fr' },
    })

    return 表单实例
  }

  private 创建用户配置表单(): 表单<用户配置表单数据> {
    let 表单实例 = new 表单<用户配置表单数据>({
      项列表: [
        { 键: 'theme', 组件: new 单选框组({ 选项列表: ['系统', '亮色', '暗色'], 方向: '横', 标签: '主题' }), 宽度: 1 },
      ],
      元素样式: { gridTemplateColumns: '1fr' },
    })

    return 表单实例
  }

  private async 加载数据(信号: AbortSignal): Promise<void> {
    if (this.用户信息 !== undefined && this.用户信息.is_admin && this.系统配置表单 !== undefined) {
      let 系统配置 = await API管理器.请求postJson并处理错误('/api/system/get-system-config', {}, { 信号 })
      this.系统配置表单.设置数据(系统配置)
    }

    if (this.用户配置表单 !== undefined) {
      let 用户配置 = await API管理器.请求postJson并处理错误('/api/user/get-user-config', {}, { 信号 })
      this.用户配置表单.设置数据(用户配置)
    }
  }

  private async 保存系统配置(): Promise<void> {
    if (this.系统配置表单 === undefined) return
    let 数据 = this.系统配置表单.获得数据()
    await API管理器.请求postJson并处理错误('/api/system/update-system-config', 数据)
    成功提示('系统配置保存成功')
  }

  private async 保存用户配置(): Promise<void> {
    if (this.用户配置表单 === undefined) return
    let 数据 = this.用户配置表单.获得数据()
    await 主题管理器.设置主题(数据.theme)
    成功提示('用户配置保存成功')
  }
}
