/**
 * 页面地址的比较规则：只看 pathname 加 hash 里的路由名，忽略 origin、查询串和每次运行都不同的部分。
 * 录制、导出和三端回放都用这一条规则，热重载包（http://IP:端口）和打包版（capacitor://localhost）才能互相认得。
 *
 * - 空 pathname 视为 `/`：`capacitor://localhost#x` 与 `capacitor://localhost/#x`、`/#x` 等价。
 * - hash 里的查询参数整体丢弃：`#page?flow=<随机编号>&step=2` 只留 `#page`。
 * - 路径或 hash 里像随机编号的段（UUID、16 位以上的十六进制、10 位以上的纯数字）换成 `:id`。
 */
let 随机段规则 = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
  /^(?=.*\d)(?=.*[a-f])[0-9a-f]{16,}$/iu,
  /^\d{10,}$/u,
]

function 替换随机段(路径: string): string {
  return 路径
    .split('/')
    .map((段) => (随机段规则.some((规则) => 规则.test(段)) ? ':id' : 段))
    .join('/')
}

function 规范路径和哈希(路径: string, 哈希: string): string {
  let 规范路径 = 替换随机段(路径 === '' ? '/' : 路径)
  let 查询位置 = 哈希.indexOf('?')
  let 路由 = 查询位置 === -1 ? 哈希 : 哈希.slice(0, 查询位置)
  return `${规范路径}${替换随机段(路由)}`
}

export function 规范地址(地址: string): string {
  if (URL.canParse(地址)) {
    let 解析 = new URL(地址)
    return 规范路径和哈希(解析.pathname, 解析.hash)
  }
  // 不带 origin 的 "/#/home"、"#/home" 或 "/path"，用占位 origin 解析后同样处理
  if (URL.canParse(地址, 'http://placeholder.invalid/')) {
    let 解析 = new URL(地址, 'http://placeholder.invalid/')
    return 规范路径和哈希(解析.pathname, 解析.hash)
  }
  return 地址
}

export function 地址一致(实际: string, 目标: string): boolean {
  return 规范地址(实际) === 规范地址(目标)
}

/** 前后两次读到的地址是否算变化；变化时返回规范后的前后地址。 */
export function 比较地址变化(前: string | undefined, 后: string | undefined): { 前: string; 后: string } | undefined {
  if (前 === undefined || 后 === undefined) return undefined
  let 前规范 = 规范地址(前)
  let 后规范 = 规范地址(后)
  return 前规范 === 后规范 ? undefined : { 前: 前规范, 后: 后规范 }
}
