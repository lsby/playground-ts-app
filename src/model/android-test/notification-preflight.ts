export type 安卓启动选项 = { 允许通知询问?: boolean }

export function 读取安卓非负整数(输出: string, 名称: string): number {
  let 文本 = 输出.trim()
  let 值 = Number(文本)
  if (/^\d+$/u.test(文本) === false || Number.isSafeInteger(值) === false)
    throw new Error(`无法读取 Android ${名称}，请检查设备 ADB 状态`)
  return 值
}

export function 通知权限状态稳定(输出: string, 当前用户: number, 包名: string): boolean {
  let 包段们 = [...输出.matchAll(/^Packages:[\t ]*$/gmu)]
  let 包段 = 包段们[0]
  if (包段们.length !== 1 || 包段 === undefined) throw new Error('无法读取已安装应用信息，请检查本地测试 App 安装状态')
  let 起点 = 包段.index + 包段[0].length
  let 后续段 = /^[^\s][^\r\n]*/gmu.exec(输出.slice(起点))
  let 包内容 = 输出.slice(起点, 后续段 === null ? undefined : 起点 + 后续段.index)
  let 包们 = [...包内容.matchAll(/^[\t ]+Package \[([^\]\r\n]+)\] \([^\r\n)]+\):[\t ]*$/gmu)]
  let 本包们 = 包们.filter((条目) => 条目[1] === 包名)
  let 本包 = 本包们[0]
  if (本包们.length !== 1 || 本包 === undefined) throw new Error('无法唯一确定本地测试 App，请检查安装状态')
  let 下个包 = 包们.find((条目) => 条目.index > 本包.index)
  let 用户内容 = 包内容.slice(本包.index + 本包[0].length, 下个包?.index)
  let 用户们 = [...用户内容.matchAll(/^[\t ]*User (\d+):[^\r\n]*/gmu)]
  let 匹配们 = 用户们.filter((用户) => 用户[1] === String(当前用户))
  let 用户 = 匹配们[0]
  if (匹配们.length !== 1 || 用户 === undefined)
    throw new Error('无法确定当前用户的本地测试 App 通知权限，请检查应用安装状态')
  let 后续 = 用户们.find((条目) => 条目.index > 用户.index)
  let 内容 = 用户内容.slice(用户.index + 用户[0].length, 后续?.index)
  let 权限们 = [
    ...内容.matchAll(
      /^[\t ]*android\.permission\.POST_NOTIFICATIONS: granted=(true|false), flags=\[([^\]\r\n]*)\][\t ]*$/gmu,
    ),
  ]
  let 权限 = 权限们[0]
  if (权限们.length !== 1 || 权限 === undefined)
    throw new Error('无法读取当前用户的本地测试 App 通知权限，请检查系统版本和应用权限设置')
  if (权限[1] === 'true') return true
  let 标记们 = (权限[2] ?? '').split('|').map((标记) => 标记.trim())
  return 标记们.some((标记) => 标记 === 'USER_FIXED' || 标记 === 'POLICY_FIXED' || 标记 === 'SYSTEM_FIXED')
}
