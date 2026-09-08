import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 成功提示, 错误提示 } from '../../global/manager/toast-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 主要按钮, 普通按钮 } from '../general/base/base-button'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 演示接口类型组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-get-interface-type-demo', this)
  }

  private 内容容器 = 创建元素('pre', {
    style: {
      width: '100%',
      maxHeight: '550px',
      overflow: 'auto',
      backgroundColor: 'var(--次要背景颜色)',
      color: 'var(--文本颜色)',
      padding: '16px 20px',
      borderRadius: '8px',
      border: '1px solid var(--边框颜色)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      fontFamily: "'Fira Code', Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace",
      fontSize: '13px',
      lineHeight: '1.6',
      boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.05)',
      boxSizing: 'border-box',
    },
  })

  private 状态标签 = 创建元素('span', { style: { marginLeft: '10px', fontWeight: 'bold' } })
  private 接口类型已启用 = false
  private 获取按钮 = new 主要按钮({
    文本: '获取接口类型',
    禁用: true,
    点击处理函数: async (): Promise<void> => {
      await this.获取数据()
    },
  })
  private 切换按钮 = new 普通按钮({
    文本: '启用接口类型获取',
    点击处理函数: async (): Promise<void> => {
      await this.切换功能状态()
    },
  })

  protected override async 当加载时(): Promise<void> {
    let 样式 = 创建元素('style', {
      textContent: `
        @keyframes 渐入动效 {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        :host {
          display: block;
          animation: 渐入动效 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        pre {
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        pre:hover {
          border-color: var(--主色调) !important;
          box-shadow: 0 0 0 3px var(--强调背景颜色);
        }
      `,
    })
    this.shadow.appendChild(样式)

    let 容器 = 创建元素('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', boxSizing: 'border-box' },
    })

    let 控制栏 = 创建元素('div', {
      style: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--间距-2)' },
    })

    控制栏.append(this.获取按钮, this.切换按钮)
    控制栏.appendChild(this.状态标签)

    容器.appendChild(控制栏)
    容器.appendChild(this.内容容器)

    this.shadow.appendChild(容器)
    this.内容容器.textContent = '暂无数据，请点击按钮获取。'
    await this.同步功能状态()
  }

  private async 同步功能状态(): Promise<void> {
    let 系统配置 = await API管理器.请求postJson并处理错误('/api/system/get-system-config', {})
    this.设置功能状态(系统配置.enable_get_interface_type)
  }

  private async 切换功能状态(): Promise<void> {
    let 新状态 = this.接口类型已启用 === false
    await API管理器.请求postJson并处理错误('/api/system/update-system-config', { enable_get_interface_type: 新状态 })
    this.设置功能状态(新状态)
    成功提示(新状态 === true ? '接口类型获取已启用' : '接口类型获取已关闭')
  }

  private 设置功能状态(启用: boolean): void {
    this.接口类型已启用 = 启用
    this.获取按钮.设置禁用(启用 === false)
    this.切换按钮.设置文本(启用 === true ? '关闭接口类型获取' : '启用接口类型获取')
    this.状态标签.textContent = 启用 === true ? '功能已启用' : '功能已关闭'
    this.状态标签.style.color = 启用 === true ? 'var(--成功颜色)' : 'var(--警告颜色)'
  }

  private async 获取数据(): Promise<void> {
    this.状态标签.textContent = '正在获取...'
    this.状态标签.style.color = 'var(--文本颜色)'
    this.内容容器.textContent = '正在加载，请稍候...'

    let 响应 = await API管理器.请求get文本('/api/system/get-interface-type')
    switch (响应.status) {
      case 'success':
        this.内容容器.textContent = 响应.data
        this.状态标签.textContent = '获取成功'
        this.状态标签.style.color = 'var(--成功颜色)'
        成功提示('接口类型获取成功！')
        break
      case 'fail':
        this.内容容器.textContent = `请求失败：\n响应内容：${响应.data}`
        this.状态标签.textContent = '获取失败'
        this.状态标签.style.color = 'var(--错误颜色)'
        错误提示(`获取接口类型失败：${响应.data}`)
        break
      case 'unexpected':
        this.内容容器.textContent = `发生异常：\n${响应.data}`
        this.状态标签.textContent = '发生异常'
        this.状态标签.style.color = 'var(--错误颜色)'
        错误提示('请求接口类型发生异常！')
        break
    }
  }
}
