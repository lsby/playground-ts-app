import { 创建元素, 应用样式 } from '../../../global/tools/create-element'
import { 主要按钮, 文本按钮 } from '../../general/base/base-button'
import { 创建图标 } from '../../general/base/icon'
import { 普通输入框 } from '../../general/form/form-input'
import { 格式化文件大小 } from './utils'

export type 上传成功结果 = { message: string; files: { name: string; size: number }[] }

export function 构建头部容器(): HTMLDivElement {
  let 头部容器 = 创建元素('div', { style: { display: 'flex', alignItems: 'center', gap: '14px' } })

  let 图标徽章 = 创建元素('div', {
    style: {
      width: '44px',
      height: '44px',
      borderRadius: '12px',
      backgroundColor: 'var(--选中背景颜色)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
    },
  })
  图标徽章.style.color = 'var(--主色调)'
  图标徽章.appendChild(创建图标('upload-cloud', 24))

  let 标题文本区 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } })

  let 主标题 = 创建元素('div', {
    textContent: '文件上传测试',
    style: { fontSize: '18px', fontWeight: '600', color: 'var(--文字颜色)' },
  })

  let 副标题 = 创建元素('div', {
    textContent: '支持选择或拖拽多个文件进行上传',
    style: { fontSize: '13px', color: 'var(--次要文字颜色)' },
  })

  标题文本区.append(主标题, 副标题)
  头部容器.append(图标徽章, 标题文本区)

  return 头部容器
}

export function 填充拖拽点击区域(拖拽点击区域: HTMLButtonElement): void {
  let 云上传Icon = 创建图标('upload-cloud', 42)
  云上传Icon.style.color = 'var(--主色调)'

  let 拖拽主说明 = 创建元素('div', {
    textContent: '点击或将文件拖拽到此处上传',
    style: { fontSize: '15px', fontWeight: '500', color: 'var(--文字颜色)' },
  })

  let 拖拽副说明 = 创建元素('div', {
    textContent: '支持多文件组合上传',
    style: { fontSize: '12px', color: 'var(--次要文字颜色)' },
  })

  拖拽点击区域.append(云上传Icon, 拖拽主说明, 拖拽副说明)
}

export function 构建文件列表头部(清空按钮: 文本按钮): HTMLDivElement {
  let 文件列表头部 = 创建元素('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  })

  let 列表标题 = 创建元素('div', {
    textContent: '待上传文件',
    style: { fontSize: '14px', fontWeight: '600', color: 'var(--文字颜色)' },
  })

  文件列表头部.append(列表标题, 清空按钮)
  return 文件列表头部
}

export function 构建描述表单组(描述输入框: 普通输入框): HTMLDivElement {
  let 描述表单组 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } })

  let 描述Label = 创建元素('div', {
    textContent: '文件描述（可选）',
    style: { fontSize: '13px', fontWeight: '500', color: 'var(--次要文字颜色)' },
  })

  描述表单组.append(描述Label, 描述输入框)
  return 描述表单组
}

export function 构建按钮容器(上传按钮: 主要按钮): HTMLDivElement {
  let 按钮容器 = 创建元素('div', { style: { width: '100%', marginTop: '4px' } })
  应用样式(上传按钮, { width: '100%' })
  按钮容器.append(上传按钮)
  return 按钮容器
}

export function 创建文件项元素(
  file: File,
  索引: number,
  是否正在上传: boolean,
  移除回调: (索引: number) => void,
): HTMLDivElement {
  let 文件项 = 创建元素('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      borderRadius: '8px',
      backgroundColor: 'var(--次要背景颜色)',
      border: '1px solid var(--边框颜色)',
      fontSize: '13px',
    },
  })

  let 文件信息左侧 = 创建元素('div', {
    style: { display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' },
  })

  let 文件Icon = 创建图标('file', 18)
  文件Icon.style.color = 'var(--主色调)'

  let 文件名文本 = 创建元素('span', {
    textContent: file.name,
    style: {
      fontWeight: '500',
      color: 'var(--文字颜色)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      maxWidth: '300px',
    },
  })

  let 文件大小文本 = 创建元素('span', {
    textContent: `(${格式化文件大小(file.size)})`,
    style: { color: 'var(--次要文字颜色)', fontSize: '12px' },
  })

  文件信息左侧.append(文件Icon, 文件名文本, 文件大小文本)

  let 删除Icon按钮 = new 文本按钮({
    图标: 创建图标('close', 16),
    标题: `移除文件 ${file.name}`,
    禁用: 是否正在上传,
    自动加载: false,
    元素样式: { width: '28px', padding: '0', color: 'var(--次要文字颜色)' },
    点击处理函数: (e: MouseEvent): void => {
      e.stopPropagation()
      移除回调(索引)
    },
  })

  文件项.append(文件信息左侧, 删除Icon按钮)
  return 文件项
}

export function 渲染上传成功结果(容器: HTMLDivElement, 结果: 上传成功结果): void {
  容器.replaceChildren()
  容器.setAttribute('role', 'status')
  应用样式(容器, {
    display: 'flex',
    backgroundColor: 'var(--选中背景颜色)',
    border: '1px solid var(--主色调)',
    color: 'var(--文字颜色)',
  })

  let 成功头部 = 创建元素('div', {
    style: { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', color: 'var(--成功前景)' },
  })
  成功头部.appendChild(创建图标('check', 20))
  成功头部.appendChild(创建元素('span', { textContent: `上传成功: ${结果.message}` }))

  let 文件列表详情 = 创建元素('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      marginTop: '6px',
      paddingLeft: '28px',
      fontSize: '13px',
      color: 'var(--次要文字颜色)',
    },
  })

  for (let fileInfo of 结果.files) {
    文件列表详情.appendChild(创建元素('div', { textContent: `• ${fileInfo.name} (${格式化文件大小(fileInfo.size)})` }))
  }

  容器.append(成功头部, 文件列表详情)
}

export function 渲染上传失败结果(容器: HTMLDivElement, 错误: unknown): void {
  容器.replaceChildren()
  容器.setAttribute('role', 'alert')
  应用样式(容器, {
    display: 'flex',
    backgroundColor: 'color-mix(in srgb, var(--错误颜色) 10%, transparent)',
    border: '1px solid var(--错误颜色)',
    color: 'var(--文字颜色)',
  })

  let 失败头部 = 创建元素('div', {
    style: { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', color: 'var(--错误前景)' },
  })
  失败头部.appendChild(创建图标('error', 20))
  失败头部.appendChild(创建元素('span', { textContent: `上传失败` }))

  let 错误内容 = 创建元素('div', {
    textContent: String(错误),
    style: { marginTop: '4px', paddingLeft: '28px', fontSize: '13px', color: 'var(--次要文字颜色)' },
  })

  容器.append(失败头部, 错误内容)
}
