export function 文件匹配接受类型(文件: File, 接受类型: string | undefined): boolean {
  if (接受类型 === undefined || 接受类型.trim() === '') return true
  let 文件名 = 文件.name.toLocaleLowerCase()
  let 媒体类型 = 文件.type.toLocaleLowerCase()
  return 接受类型.split(',').some((原规则): boolean => {
    let 规则 = 原规则.trim().toLocaleLowerCase()
    if (规则.startsWith('.')) return 文件名.endsWith(规则)
    if (规则.endsWith('/*')) return 媒体类型.startsWith(规则.slice(0, -1))
    return 媒体类型 === 规则
  })
}
