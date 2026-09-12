import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 是中止错误 } from '../../global/tools/abort'
import { 创建元素 } from '../../global/tools/create-element'
import { 数字输入框 } from '../general/form/form-input'

type 发出事件类型 = {}
type 监听事件类型 = {}

type 加法配置 = { a?: number | undefined; b?: number | undefined }

export class 演示加法组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-add-demo', this)
  }

  private 值a: number | null = 0
  private 值b: number | null = 0
  private 结果 = 创建元素('p')
  private 输入框1 = new 数字输入框({ 占位符: '输入第一个数字' })
  private 输入框2 = new 数字输入框({ 占位符: '输入第二个数字' })
  private 请求控制器 = new AbortController()
  private 请求代次 = 0

  public constructor(配置: 加法配置 = {}) {
    super()
    this.值a = 配置.a ?? 0
    this.值b = 配置.b ?? 0
    this.输入框1.监听发出事件('输入', async (事件): Promise<void> => {
      this.值a = 事件.detail
      await this.计算结果()
    })
    this.输入框2.监听发出事件('输入', async (事件): Promise<void> => {
      this.值b = 事件.detail
      await this.计算结果()
    })
  }

  protected override async 当加载时(): Promise<void> {
    this.输入框1.设置值(this.值a)
    this.输入框2.设置值(this.值b)

    let 输入框1容器 = 创建元素('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
        height: 'auto',
      },
    })
    输入框1容器.append(this.输入框1)

    let 输入框2容器 = 创建元素('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
        height: 'auto',
      },
    })
    输入框2容器.append(this.输入框2)

    let 结果容器 = 创建元素('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
        height: 'auto',
      },
    })
    结果容器.append(this.结果)

    this.shadow.append(输入框1容器, 输入框2容器, 结果容器)
    await this.计算结果()
  }

  protected override 当卸载时(): void {
    this.请求代次 += 1
    this.请求控制器.abort()
  }

  private async 计算结果(): Promise<void> {
    this.请求代次 += 1
    let 本次代次 = this.请求代次
    this.请求控制器.abort()
    let 本次控制器 = new AbortController()
    this.请求控制器 = 本次控制器
    if (this.值a === null || this.值b === null) {
      this.结果.textContent = '请输入两个数字'
      return
    }
    try {
      let 调用结果 = await API管理器.请求postJson并处理错误(
        '/api/demo/base/add',
        { a: this.值a, b: this.值b },
        { 信号: 本次控制器.signal },
      )
      if (本次代次 === this.请求代次 && 本次控制器.signal.aborted === false)
        this.结果.textContent = 调用结果.res.toString()
    } catch (错误) {
      if (是中止错误(错误, 本次控制器.signal) === false) throw 错误
    }
  }
}
