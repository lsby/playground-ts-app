export function 格式化文件大小(字节数: number): string {
  if (字节数 < 1024) {
    return `${字节数} B`
  }
  if (字节数 < 1024 * 1024) {
    return `${(字节数 / 1024).toFixed(1)} KB`
  }
  return `${(字节数 / (1024 * 1024)).toFixed(1)} MB`
}
