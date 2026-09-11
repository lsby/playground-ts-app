import { 组件基类 } from '../../../base/base'
import { API管理器 } from '../../../global/manager/api-manager'
import { 创建元素, 应用样式 } from '../../../global/tools/create-element'
import { 主要按钮, 文本按钮 } from '../../general/base/base-button'
import { 普通输入框 } from '../../general/form/form-input'
import {
  创建文件项元素,
  填充拖拽点击区域,
  构建头部容器,
  构建按钮容器,
  构建描述表单组,
  构建文件列表头部,
  渲染上传失败结果,
  渲染上传成功结果,
} from './ui-builder'

type 发出事件类型 = {}
type 监听事件类型 = {}

export class 演示文件上传组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-file-upload-demo', this)
  }

  private 原生文件输入: HTMLInputElement = 创建元素('input', {
    type: 'file',
    multiple: true,
    style: { display: 'none' },
  })

  private 描述输入框: 普通输入框 = new 普通输入框({ 占位符: '添加文件说明（可选）...', 可访问名称: '文件描述（可选）' })

  private 上传按钮: 主要按钮 = new 主要按钮({
    文本: '开始上传文件',
    点击处理函数: async (): Promise<void> => {
      await this.执行上传操作()
    },
  })

  private 清空按钮: 文本按钮 = new 文本按钮({
    文本: '清空已选',
    点击处理函数: async (): Promise<void> => {
      if (this.是否正在上传 === false) {
        this.已选文件列表 = []
        this.更新界面视图()
      }
    },
  })

  private 外层容器: HTMLDivElement = 创建元素('div', {
    style: { width: '100%', display: 'flex', justifyContent: 'center', padding: '20px 0', boxSizing: 'border-box' },
  })

  private 卡片容器: HTMLDivElement = 创建元素('div', {
    style: {
      width: '100%',
      maxWidth: '640px',
      backgroundColor: 'var(--卡片背景颜色)',
      border: '1px solid var(--边框颜色)',
      borderRadius: '16px',
      padding: '28px',
      boxShadow: '0 8px 24px var(--深阴影颜色)',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    },
  })

  private 拖拽点击区域: HTMLButtonElement = 创建元素('button', {
    type: 'button',
    style: {
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px',
      border: '2px dashed var(--边框颜色)',
      borderRadius: '12px',
      backgroundColor: 'var(--次要背景颜色)',
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
      textAlign: 'center',
      gap: '10px',
      color: 'var(--文字颜色)',
      fontFamily: 'inherit',
    },
  })

  private 已选文件区: HTMLDivElement = 创建元素('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '10px' },
  })

  private 文件列表容器: HTMLDivElement = 创建元素('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' },
  })

  private 结果显示容器: HTMLDivElement = 创建元素('div', {
    style: {
      display: 'none',
      flexDirection: 'column',
      gap: '10px',
      padding: '16px',
      borderRadius: '10px',
      fontSize: '14px',
      lineHeight: '1.5',
      boxSizing: 'border-box',
    },
  })

  private 已选文件列表: File[] = []
  private 是否正在上传: boolean = false

  protected override async 当加载时(): Promise<void> {
    this.构建界面结构()
    this.绑定事件处理器()
    this.更新界面视图()
  }

  private 构建界面结构(): void {
    this.外层容器.replaceChildren()
    this.卡片容器.replaceChildren()
    this.拖拽点击区域.replaceChildren()
    this.已选文件区.replaceChildren()

    let 头部容器 = 构建头部容器()
    填充拖拽点击区域(this.拖拽点击区域)

    let 文件列表头部 = 构建文件列表头部(this.清空按钮)
    this.已选文件区.append(文件列表头部, this.文件列表容器)

    let 描述表单组 = 构建描述表单组(this.描述输入框)
    let 按钮容器 = 构建按钮容器(this.上传按钮)

    this.卡片容器.append(
      头部容器,
      this.原生文件输入,
      this.拖拽点击区域,
      this.已选文件区,
      描述表单组,
      按钮容器,
      this.结果显示容器,
    )

    this.外层容器.append(this.卡片容器)
    this.shadow.append(this.外层容器)
  }

  private 绑定事件处理器(): void {
    this.拖拽点击区域.onclick = (): void => {
      if (this.是否正在上传 === false) {
        this.原生文件输入.click()
      }
    }

    this.拖拽点击区域.onmouseenter = (): void => {
      if (this.是否正在上传 === false) {
        应用样式(this.拖拽点击区域, { borderColor: 'var(--主色调)', backgroundColor: 'var(--选中背景颜色)' })
      }
    }

    this.拖拽点击区域.onmouseleave = (): void => {
      应用样式(this.拖拽点击区域, { borderColor: 'var(--边框颜色)', backgroundColor: 'var(--次要背景颜色)' })
    }

    this.拖拽点击区域.ondragover = (e: DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (this.是否正在上传 === false) {
        应用样式(this.拖拽点击区域, { borderColor: 'var(--主色调)', backgroundColor: 'var(--选中背景颜色)' })
      }
    }

    this.拖拽点击区域.ondragleave = (e: DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      应用样式(this.拖拽点击区域, { borderColor: 'var(--边框颜色)', backgroundColor: 'var(--次要背景颜色)' })
    }

    this.拖拽点击区域.ondrop = (e: DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      应用样式(this.拖拽点击区域, { borderColor: 'var(--边框颜色)', backgroundColor: 'var(--次要背景颜色)' })

      if (this.是否正在上传 === true) {
        return
      }

      let files = e.dataTransfer?.files
      if (files !== undefined && files.length > 0) {
        let 新文件数组: File[] = []
        for (let i = 0; i < files.length; i = i + 1) {
          let file = files.item(i)
          if (file !== null) {
            新文件数组.push(file)
          }
        }
        this.追加文件(新文件数组)
      }
    }

    this.原生文件输入.onchange = (): void => {
      let files = this.原生文件输入.files
      if (files !== null && files.length > 0) {
        let 新文件数组: File[] = []
        for (let i = 0; i < files.length; i = i + 1) {
          let file = files.item(i)
          if (file !== null) {
            新文件数组.push(file)
          }
        }
        this.追加文件(新文件数组)
      }
      this.原生文件输入.value = ''
    }
  }

  private 追加文件(新文件数组: File[]): void {
    for (let file of 新文件数组) {
      let 已存在 = this.已选文件列表.some((f) => f.name === file.name && f.size === file.size)
      if (已存在 === false) {
        this.已选文件列表.push(file)
      }
    }
    this.更新界面视图()
  }

  private 移除文件(索引: number): void {
    if (索引 >= 0 && 索引 < this.已选文件列表.length) {
      this.已选文件列表.splice(索引, 1)
      this.更新界面视图()
    }
  }

  private 更新界面视图(): void {
    this.文件列表容器.replaceChildren()
    this.拖拽点击区域.disabled = this.是否正在上传
    if (this.已选文件列表.length === 0) {
      应用样式(this.已选文件区, { display: 'none' })
    } else {
      应用样式(this.已选文件区, { display: 'flex' })
      for (let i = 0; i < this.已选文件列表.length; i = i + 1) {
        let file = this.已选文件列表[i]
        if (file === undefined) continue

        let 文件项 = 创建文件项元素(file, i, this.是否正在上传, (索引: number) => {
          this.移除文件(索引)
        })

        this.文件列表容器.appendChild(文件项)
      }
    }

    if (this.是否正在上传 === true) {
      this.上传按钮.设置禁用(true)
      this.上传按钮.设置文本('正在上传中...')
      this.清空按钮.设置禁用(true)
    } else {
      if (this.已选文件列表.length === 0) {
        this.上传按钮.设置禁用(true)
        this.上传按钮.设置文本('请先选择文件')
        this.清空按钮.设置禁用(true)
      } else {
        this.上传按钮.设置禁用(false)
        this.上传按钮.设置文本(`开始上传 (${this.已选文件列表.length} 个文件)`)
        this.清空按钮.设置禁用(false)
      }
    }
  }

  private async 执行上传操作(): Promise<void> {
    if (this.已选文件列表.length === 0 || this.是否正在上传 === true) {
      return
    }

    this.是否正在上传 = true
    this.更新界面视图()
    应用样式(this.结果显示容器, { display: 'none' })

    let formData = new FormData()
    for (let file of this.已选文件列表) {
      formData.append('files', file)
    }

    let 描述 = this.描述输入框.获得值().trim()
    if (描述 !== '') {
      formData.append('description', 描述)
    }

    try {
      let 结果 = await API管理器.请求form并处理错误('/api/demo/file/upload-file', formData)
      渲染上传成功结果(this.结果显示容器, 结果)
      this.已选文件列表 = []
      this.描述输入框.设置值('')
    } catch (错误) {
      渲染上传失败结果(this.结果显示容器, 错误)
    } finally {
      this.是否正在上传 = false
      this.更新界面视图()
    }
  }
}
