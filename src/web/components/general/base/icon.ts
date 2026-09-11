import { 组件基类 } from '../../../base/base'

export type 图标名称 =
  | 'close'
  | 'maximize'
  | 'restore'
  | 'check'
  | 'error'
  | 'warning'
  | 'info'
  | 'menu'
  | 'copy'
  | 'plus'
  | 'chevron-down'

let 路径映射: Record<图标名称, string[]> = {
  close: ['M6 6l12 12M18 6L6 18'],
  maximize: ['M5 5h14v14H5z'],
  restore: ['M8 5h11v11', 'M5 8h11v11H5z'],
  check: ['M5 12l4 4L19 6'],
  error: ['M12 8v5', 'M12 17h.01', 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
  warning: ['M12 9v4', 'M12 17h.01', 'M10.3 3.7L2.5 18a2 2 0 001.8 3h15.4a2 2 0 001.8-3L13.7 3.7a2 2 0 00-3.4 0z'],
  info: ['M12 11v6', 'M12 7h.01', 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
  menu: ['M4 7h16M4 12h16M4 17h16'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  plus: ['M12 5v14M5 12h14'],
  'chevron-down': ['M6 9l6 6 6-6'],
}

export function 创建图标(名称: 图标名称, 尺寸: number = 18): SVGSVGElement {
  let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(尺寸))
  svg.setAttribute('height', String(尺寸))
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (let 路径 of 路径映射[名称]) {
    let path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', 路径)
    svg.append(path)
  }
  return svg
}

type 图标事件 = {}
type 图标监听事件 = {}

export class 图标组件 extends 组件基类<图标事件, 图标监听事件> {
  static {
    this.注册组件('lsby-icon', this)
  }

  private 名称: 图标名称
  private 尺寸: number

  public constructor(名称: 图标名称 = 'info', 尺寸: number = 18) {
    super()
    this.名称 = 名称
    this.尺寸 = 尺寸
  }

  protected override 当加载时(): void {
    this.获得宿主样式().display = 'inline-flex'
    this.shadow.append(创建图标(this.名称, this.尺寸))
  }
}
