import { 组件基类 } from '../../../base/base'
import { 右键菜单管理器 } from '../../../global/manager/context-menu-manager'
import { 创建元素 } from '../../../global/tools/create-element'
import { 普通按钮 } from '../base/base-button'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 日志组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-log', this)
  }

  private 日志数组: string[] = []
  private 最大行数 = 1000
  private 日志容器: HTMLDivElement | null = null
  private 滚动阈值 = 20 // 像素阈值
  private 自动滚动 = true
  private 选中的索引集合 = new Set<number>()
  private 正在选择 = false
  private 选择起始索引: number | null = null
  private 发生了拖动 = false
  private 上一个选中的索引: number | null = null
  private 正在加载 = false
  private 上一次滚动位置 = 0
  private 滚动到底部按钮: 普通按钮 | null = null

  protected override async 当加载时(): Promise<void> {
    this.获得宿主样式().height = '100%'

    let 包装器 = 创建元素('div', { style: { position: 'relative', width: '100%', height: '100%' } })

    let 容器 = 创建元素('div', {
      style: {
        width: '100%',
        height: '100%',
        border: '1px solid var(--边框颜色)',
        borderRadius: '4px',
        overflowY: 'auto',
        backgroundColor: 'var(--背景颜色)',
        color: 'var(--文字颜色)',
        fontFamily: 'monospace',
        fontSize: '12px',
        padding: '10px',
        boxSizing: 'border-box',
      },
    })

    let 滚动到底部按钮 = new 普通按钮({
      文本: '↓',
      元素样式: {
        position: 'absolute',
        bottom: '10px',
        right: '20px',
        width: '32px',
        height: '32px',
        padding: '0',
        backgroundColor: 'var(--按钮背景)',
        color: 'var(--按钮文字)',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: 'bold',
        boxShadow: '0 2px 4px var(--深阴影颜色)',
        opacity: '0.7',
      },
      点击处理函数: (): void => {
        if (this.日志容器 !== null) {
          this.日志容器.scrollTop = this.日志容器.scrollHeight
        }
      },
    })

    this.滚动到底部按钮 = 滚动到底部按钮

    this.日志容器 = 容器
    包装器.appendChild(容器)
    包装器.appendChild(滚动到底部按钮)
    this.shadow.appendChild(包装器)

    // 监听滚动事件
    容器.onscroll = (): void => {
      if (this.日志容器 !== null) {
        let 当前滚动位置 = this.日志容器.scrollTop
        let 向上滚动 = 当前滚动位置 < this.上一次滚动位置
        let 滚动到底部距离 = this.日志容器.scrollHeight - 当前滚动位置 - this.日志容器.clientHeight
        if (向上滚动 === true) {
          this.自动滚动 = false
        } else if (滚动到底部距离 <= this.滚动阈值) {
          this.自动滚动 = true
        }
        this.上一次滚动位置 = 当前滚动位置
        if (this.滚动到底部按钮 !== null) {
          if (滚动到底部距离 <= this.滚动阈值) {
            this.滚动到底部按钮.style.display = 'none'
          } else {
            this.滚动到底部按钮.style.display = 'block'
          }
        }
      }
    }

    容器.onpointerdown = (事件: PointerEvent): void => {
      if (事件.pointerType !== 'mouse' || 事件.button !== 0 || 事件.target instanceof HTMLElement === false) return
      let 索引 = this.获取日志行索引(事件.target)
      if (索引 === null) return
      事件.preventDefault()
      容器.setPointerCapture(事件.pointerId)
      this.正在选择 = true
      this.发生了拖动 = false
      this.选择起始索引 = 索引
      if (事件.ctrlKey === false && 事件.shiftKey === false) {
        this.选中的索引集合.clear()
        this.选中的索引集合.add(索引)
        this.上一个选中的索引 = 索引
      } else if (事件.ctrlKey === true) {
        if (this.选中的索引集合.has(索引) === true) this.选中的索引集合.delete(索引)
        else this.选中的索引集合.add(索引)
        this.上一个选中的索引 = 索引
      } else if (事件.shiftKey === true) {
        let 基准索引 = this.上一个选中的索引
        if (基准索引 !== null) {
          let 开始 = Math.min(基准索引, 索引)
          let 结束 = Math.max(基准索引, 索引)
          this.选中的索引集合.clear()
          for (let i = 开始; i <= 结束; i++) this.选中的索引集合.add(i)
        } else {
          this.选中的索引集合.add(索引)
          this.上一个选中的索引 = 索引
        }
      }
      this.更新选中状态()
    }

    // 添加点击事件监听器,用于清除选择
    容器.onclick = (事件: MouseEvent): void => {
      if (事件.button === 0 && this.发生了拖动 === false) {
        // 左键且没有发生拖动
        let 索引 = this.获取日志行索引(事件.target as HTMLElement)
        if (索引 === null) {
          // 点击空白处,清除选择
          this.选中的索引集合.clear()
          this.更新选中状态()
        }
      }
    }

    容器.onpointermove = (事件: PointerEvent): void => {
      if (this.正在选择 === true && this.选择起始索引 !== null) {
        let 指针下元素 = this.shadow.elementFromPoint(事件.clientX, 事件.clientY)
        if (指针下元素 instanceof HTMLElement === false) return
        let 当前索引 = this.获取日志行索引(指针下元素)
        if (当前索引 !== null && 当前索引 !== this.选择起始索引) {
          this.发生了拖动 = true
          let 起始索引 = this.选择起始索引
          let 新选中集合 = new Set<number>()

          // 如果按住Ctrl，保留旧的选择
          if (事件.ctrlKey === true) {
            for (let 索引 of this.选中的索引集合) {
              新选中集合.add(索引)
            }
          } else if (事件.shiftKey === true) {
            // Shift拖动：从上一个选中的索引开始作为基准
            let 基准索引 = this.上一个选中的索引
            if (基准索引 !== null) {
              起始索引 = 基准索引
            }
          }

          // 添加从起始到当前的范围
          let 开始 = Math.min(起始索引, 当前索引)
          let 结束 = Math.max(起始索引, 当前索引)
          for (let i = 开始; i <= 结束; i++) {
            新选中集合.add(i)
          }

          this.选中的索引集合 = 新选中集合
          this.更新选中状态()
        }
      }
    }

    let 结束选择 = (事件: PointerEvent): void => {
      if (容器.hasPointerCapture(事件.pointerId) === true) 容器.releasePointerCapture(事件.pointerId)
      this.正在选择 = false
      this.选择起始索引 = null
    }
    容器.onpointerup = 结束选择
    容器.onpointercancel = 结束选择

    // 监听右键菜单
    容器.oncontextmenu = (事件: MouseEvent): void => {
      事件.preventDefault()
      if (事件.target instanceof HTMLElement === false) return
      let 索引 = this.获取日志行索引(事件.target)
      if (索引 !== null && this.选中的索引集合.has(索引) === false) {
        // 如果点击的项没有被选中，则选中它
        this.选中的索引集合.clear()
        this.选中的索引集合.add(索引)
        this.上一个选中的索引 = 索引
        this.更新选中状态()
      }
      右键菜单管理器.获得实例().显示菜单(事件.clientX, 事件.clientY, [
        { 文本: '复制', 回调: (): void => this.复制选中日志() },
        { 文本: '清空日志', 回调: (): void => this.清空日志(), 危险: true },
      ])
    }
    this.渲染日志()
  }

  public 添加日志(消息: string): void {
    this.添加多条日志([消息])
  }

  public 添加多条日志(消息列表: readonly string[]): void {
    for (let 消息 of 消息列表) this.日志数组.push(消息)
    let 移除数量 = Math.max(0, this.日志数组.length - this.最大行数)
    if (移除数量 > 0) {
      this.日志数组.splice(0, 移除数量)
      this.选中的索引集合 = new Set(
        [...this.选中的索引集合].map((索引): number => 索引 - 移除数量).filter((索引): boolean => 索引 >= 0),
      )
      this.选择起始索引 = this.调整日志索引(this.选择起始索引, 移除数量)
      this.上一个选中的索引 = this.调整日志索引(this.上一个选中的索引, 移除数量)
    }
    if (this.正在加载 === false) this.渲染日志(移除数量)
  }

  public 清空日志(): void {
    this.日志数组 = []
    this.选中的索引集合.clear()
    this.正在选择 = false
    this.选择起始索引 = null
    this.上一个选中的索引 = null
    this.自动滚动 = true
    this.上一次滚动位置 = 0
    this.渲染日志()
  }

  private 获取日志行索引(元素: HTMLElement): number | null {
    if (this.日志容器 === null) return null

    // 找到最近的日志行元素
    let 日志行元素: HTMLElement | null = 元素
    while (日志行元素 !== null && 日志行元素.parentElement !== this.日志容器) {
      日志行元素 = 日志行元素.parentElement
    }

    if (日志行元素 === null || 日志行元素.parentElement !== this.日志容器 || 日志行元素.dataset['logRow'] !== 'true')
      return null

    // 获取元素在容器中的索引
    let 子元素数组 = Array.from(this.日志容器.children)
    let 索引 = 子元素数组.indexOf(日志行元素)
    return 索引 >= 0 ? 索引 : null
  }

  private 更新选中状态(): void {
    if (this.日志容器 === null) return

    for (let i = 0; i < this.日志容器.children.length; i++) {
      let 子元素 = this.日志容器.children[i] as HTMLDivElement
      if (this.选中的索引集合.has(i) === true) {
        子元素.style.backgroundColor = 'var(--选中背景颜色)'
        子元素.style.color = 'var(--文字颜色)'
      } else {
        子元素.style.backgroundColor = ''
        子元素.style.color = ''
      }
    }
  }

  private 渲染日志(移除头部行数: number = 0): void {
    if (this.日志容器 === null) return

    if (this.正在加载 === true) {
      let 加载指示器 = 创建元素('div', {
        textContent: '正在加载日志...',
        style: {
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          fontSize: '16px',
          color: 'var(--文字颜色)',
        },
      })
      this.日志容器.replaceChildren(加载指示器)
      return
    }

    if (this.日志数组.length === 0) {
      let 无日志提示 = 创建元素('div', {
        textContent: '暂无日志',
        style: {
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          fontSize: '16px',
          color: 'var(--文字颜色)',
        },
      })
      this.日志容器.replaceChildren(无日志提示)
      return
    }

    let 首个元素 = this.日志容器.firstElementChild
    let 需要重建 = 首个元素 !== null && 首个元素 instanceof HTMLElement && 首个元素.dataset['logRow'] !== 'true'
    if (需要重建 === true) {
      this.日志容器.replaceChildren()
      移除头部行数 = 0
    }
    for (let i = 0; i < 移除头部行数; i += 1) this.日志容器.firstElementChild?.remove()

    let 新日志片段 = document.createDocumentFragment()
    for (let i = this.日志容器.children.length; i < this.日志数组.length; i++) {
      let 日志 = this.日志数组[i]
      if (日志 !== undefined) {
        let 日志行 = 创建元素('div', {
          textContent: 日志,
          style: { marginBottom: '2px', wordBreak: 'break-word', cursor: 'default' },
        })
        日志行.dataset['logRow'] = 'true'
        新日志片段.appendChild(日志行)
      }
    }
    this.日志容器.appendChild(新日志片段)

    if (需要重建 === true || 移除头部行数 > 0) this.更新选中状态()

    // 如果自动滚动，则滚动到底部
    if (this.自动滚动) {
      this.日志容器.scrollTop = this.日志容器.scrollHeight
    }
  }

  private 复制选中日志(): void {
    let 选中的日志: string[] = []
    let 排序的索引 = Array.from(this.选中的索引集合).sort((a, b) => a - b)
    for (let 索引 of 排序的索引) {
      let 日志 = this.日志数组[索引]
      if (日志 !== undefined) {
        选中的日志.push(日志)
      }
    }
    let 文本 = 选中的日志.join('\n')

    // 优先使用execCommand方法，这在非HTTPS环境下也能工作
    let 文本区域 = 创建元素('textarea', { value: 文本, style: { position: 'fixed', left: '-9999px', top: '-9999px' } })
    document.body.appendChild(文本区域)
    文本区域.focus()
    文本区域.select()

    let 成功 = false
    try {
      成功 = document.execCommand('copy')
    } catch (错误) {
      console.error('execCommand复制失败:', 错误)
    }

    document.body.removeChild(文本区域)

    // 如果execCommand失败且clipboard API可用，尝试使用现代API
    if (成功 === false && typeof navigator.clipboard !== 'undefined') {
      navigator.clipboard.writeText(文本).catch((错误) => {
        console.error('clipboard API复制失败:', 错误)
      })
    }
  }

  private 调整日志索引(索引: number | null, 移除数量: number): number | null {
    if (索引 === null) return null
    let 新索引 = 索引 - 移除数量
    return 新索引 < 0 ? null : 新索引
  }

  public 设置加载状态(加载: boolean): void {
    this.正在加载 = 加载
    this.渲染日志()
  }
}
