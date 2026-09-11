import { API管理器 } from './api-manager'

type 主题类型 = '系统' | '亮色' | '暗色'

export let 主题管理器 = {
  当前主题: '系统',

  async 初始化(从数据库加载: boolean = true): Promise<void> {
    if (从数据库加载) {
      try {
        let 结果 = await API管理器.请求postJson('/api/user/get-user-config', {})
        if (结果.status === 'success') {
          this.当前主题 = 结果.data.theme
          this.应用主题()
        } else {
          this.当前主题 = '系统'
          this.应用主题()
        }
      } catch (_e) {
        // 如果获取失败，使用系统主题
        this.当前主题 = '系统'
        this.应用主题()
      }
    } else {
      // 不尝试从数据库加载，直接使用系统主题
      this.当前主题 = '系统'
      this.应用主题()
    }

    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').onchange = (): void => {
      if (this.当前主题 === '系统') {
        this.应用主题()
      }
    }
  },

  应用主题(): void {
    let 实际应用主题 = this.当前主题
    if (实际应用主题 === '系统') {
      实际应用主题 = window.matchMedia('(prefers-color-scheme: dark)').matches ? '暗色' : '亮色'
    }

    if (实际应用主题 === '暗色') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.setAttribute('data-theme', 'light')
    }
  },

  async 设置主题(主题: 主题类型): Promise<void> {
    let 原主题 = this.当前主题
    this.当前主题 = 主题
    this.应用主题()

    // 更新数据库中的用户配置
    try {
      await API管理器.请求postJson并处理错误('/api/user/update-user-config', { theme: 主题 })
    } catch (错误) {
      this.当前主题 = 原主题
      this.应用主题()
      throw 错误
    }
  },
}
