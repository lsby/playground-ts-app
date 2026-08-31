export function 获得滚动条样式(选择器: string = ':host'): string {
  return `
    ${选择器} {
      scrollbar-width: var(--滚动条标准宽度);
      scrollbar-color: var(--滚动条滑块颜色) var(--滚动条轨道颜色);
    }
    ${选择器}::-webkit-scrollbar {
      width: var(--滚动条宽度);
      height: var(--滚动条宽度);
    }
    ${选择器}::-webkit-scrollbar-track {
      background: var(--滚动条轨道颜色);
    }
    ${选择器}::-webkit-scrollbar-thumb {
      background: var(--滚动条滑块颜色);
      border-radius: var(--滚动条圆角);
    }
    ${选择器}::-webkit-scrollbar-thumb:hover {
      background: var(--滚动条滑块悬浮颜色);
    }
  `
}
