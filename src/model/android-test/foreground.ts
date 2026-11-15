type 活动记录 = { 标识: string; 用户: string; 组件: string; 任务: string }

function 读取活动(文本: string): 活动记录 | undefined {
  let 匹配 = /^ActivityRecord\{([a-f\d]+)\s+u(\d+)\s+(\S+)\s+t(\d+)\}$/u.exec(文本.trim())
  let [, 标识, 用户, 组件, 任务] = 匹配 ?? []
  if (标识 === undefined || 用户 === undefined || 组件 === undefined || 任务 === undefined) return undefined
  return { 标识, 用户, 组件, 任务 }
}

/** 仅验证权限活动与本地测试任务的归属，不输出活动栈内容。 */
export function 权限活动来自测试应用(输出: string, 当前组件: string, 测试包名: string, 启动组件: string): boolean {
  let 顶层们 = [...输出.matchAll(/^\s*topResumedActivity=(ActivityRecord\{[^\r\n]+\})\s*$/gmu)]
  if (顶层们.length !== 1) return false
  let 顶层文本 = 顶层们[0]?.[1]
  if (顶层文本 === undefined) return false
  let 顶层 = 读取活动(顶层文本)
  if (顶层 === undefined || 顶层.组件 !== 当前组件) return false
  let 历史们 = [...输出.matchAll(/^[\t ]*\* Hist\s+#\d+:\s+(ActivityRecord\{[^\r\n]+\})/gmu)]
  let 活动们 = 历史们.map((匹配, 序号) => ({
    活动: 读取活动(匹配[1] ?? ''),
    内容: 输出.slice(匹配.index + 匹配[0].length, 历史们[序号 + 1]?.index),
  }))
  let 对应们 = 活动们.filter(({ 活动 }) => 活动?.标识 === 顶层.标识)
  if (对应们.length !== 1) return false
  let 对应 = 对应们[0]
  if (
    对应 === undefined ||
    对应.活动?.组件 !== 当前组件 ||
    对应.活动.任务 !== 顶层.任务 ||
    对应.活动.用户 !== 顶层.用户
  )
    return false
  let 来源们 = [...对应.内容.matchAll(/\blaunchedFromUid=(\d+)\s+launchedFromPackage=([^\s]+)(?:\s|$)/gu)]
  let 来源 = 来源们[0]
  if (来源们.length !== 1 || 来源?.[2] !== 测试包名) return false
  let 任务们 = [...对应.内容.matchAll(/\btask=Task\{[^\r\n}]*#(\d+)\s[^\r\n}]*\bA=(\d+):([^\s}]+)[^\r\n}]*\}/gu)]
  let 任务 = 任务们[0]
  if (任务们.length !== 1 || 任务?.[1] !== 顶层.任务 || 任务[2] !== 来源[1] || 任务[3] !== 测试包名) return false
  let 根标记们 = [...对应.内容.matchAll(/\brootOfTask=(true|false)\b/gu)]
  if (根标记们.length !== 1 || 根标记们[0]?.[1] !== 'false') return false
  let 根活动们 = 活动们.filter(
    ({ 活动 }) => 活动?.任务 === 顶层.任务 && 活动.用户 === 顶层.用户 && 活动.组件 === 启动组件,
  )
  let 根活动 = 根活动们[0]
  if (根活动们.length !== 1 || 根活动 === undefined) return false
  let 根活动标记们 = [...根活动.内容.matchAll(/\brootOfTask=(true|false)\b/gu)]
  return 根活动标记们.length === 1 && 根活动标记们[0]?.[1] === 'true'
}
