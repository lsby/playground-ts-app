import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { 写入缓存, 收集目录文件, 计算文件指纹, 读取有效缓存 } from '../gen/content-fingerprint'

export function 计算测试Web输入(根目录: string, 环境文件: string, 环境摘要: string): string {
  let 文件们 = ['src', 'public', 'prisma', 'scripts', 'patches'].flatMap((目录): string[] =>
    收集目录文件(path.join(根目录, 目录)),
  )
  for (let 项 of fs.readdirSync(根目录, { withFileTypes: true })) {
    if (项.isFile() && /(?:^package\.json$|^pnpm-lock\.yaml$|^tsconfig.*\.json$|^\.|config\.)/u.test(项.name))
      文件们.push(path.join(根目录, 项.name))
  }
  文件们.push(path.resolve(根目录, 环境文件))
  return 计算文件指纹(
    根目录,
    文件们,
    JSON.stringify({ 版本: 1, node: process.version, 平台: process.platform, 环境摘要 }),
  )
}

/** 环境只在内存中参与哈希；启动命令自带的 npm 生命周期变量不会污染跨入口命中。 */
export function 计算构建环境摘要(根目录: string, 解析环境: object, 环境: NodeJS.ProcessEnv): string {
  let 启动器变量 = new Set([
    'PATH',
    'Path',
    'INIT_CWD',
    'PWD',
    'OLDPWD',
    'SHLVL',
    '_',
    'TASK_EXECUTION_PHASE',
    'TERM',
    'COLORTERM',
    'FORCE_COLOR',
  ])
  let 纳入环境 = (名称: string): boolean =>
    启动器变量.has(名称) === false && /^(?:npm_|pnpm_|PNPM_|CODEX_|VSCODE_)/u.test(名称) === false
  let 名称们 = new Set(Object.keys(环境).filter(纳入环境))
  for (let 文件 of 收集目录文件(path.join(根目录, 'src')).filter((项): boolean => /\.[cm]?[jt]sx?$/u.test(项))) {
    for (let 匹配 of fs
      .readFileSync(文件, 'utf8')
      .matchAll(/process\s*\.\s*env\s*(?:\.\s*([A-Z_][A-Z0-9_]*)|\[\s*['"]([^'"]+)['"]\s*\])/gu)) {
      let 名称 = 匹配[1] ?? 匹配[2]
      if (名称 !== undefined) 名称们.add(名称)
    }
  }
  for (let 名称 of Object.keys(环境)) if (名称.startsWith('PARCEL_')) 名称们.add(名称)
  let 规整模块路径 = (值: string): string => {
    let 已有 = new Set<string>()
    let 路径们: string[] = []
    for (let 项 of 值.split(path.delimiter)) {
      if (项 === '') continue
      let 完整 = path.resolve(根目录, 项)
      let 比较键 = process.platform === 'win32' ? 完整.toLowerCase() : 完整
      if (已有.has(比较键)) continue
      已有.add(比较键)
      路径们.push(比较键)
    }
    return JSON.stringify(路径们)
  }
  let 环境值 = [...名称们].sort().map((名称): [string, string | null] => {
    let 值 = 环境[名称]
    // pnpm 的 tsx 启动包装会重复前置同一组 NODE_PATH；只合并重复项，保留真实解析顺序。
    return [名称, 名称 === 'NODE_PATH' && 值 !== undefined ? 规整模块路径(值) : (值 ?? null)]
  })
  let 过滤后的解析环境 = Object.fromEntries(
    Object.entries(解析环境).filter(([名称]): boolean => 纳入环境(名称) && 环境[名称] === undefined),
  )
  return createHash('sha256')
    .update(JSON.stringify({ 解析环境: 过滤后的解析环境, 环境值 }))
    .digest('hex')
}

export function 计算测试Web输出(根目录: string): string | null {
  let 输出目录 = path.join(根目录, 'test-outputs/web-test')
  let 文件们 = 收集目录文件(输出目录)
  let 页面目录 = path.join(根目录, 'src/web/page')
  let 页面们 = 收集目录文件(页面目录).filter((文件): boolean => 文件.endsWith('.html'))
  if (
    文件们.length === 0 ||
    页面们.length === 0 ||
    页面们.some((文件): boolean => fs.existsSync(path.join(输出目录, path.relative(页面目录, 文件))) === false)
  )
    return null
  return 计算文件指纹(根目录, 文件们)
}

export async function 准备测试Web构建(参数: {
  根目录: string
  环境文件: string
  环境摘要: string
  生成: () => Promise<void>
  构建: () => Promise<void>
}): Promise<{ 命中: boolean; 耗时毫秒: number }> {
  let 开始 = performance.now()
  let { 根目录, 环境文件, 环境摘要 } = 参数
  let 缓存文件 = path.join(根目录, 'test-outputs/build-cache/web-test.json')
  fs.mkdirSync(path.dirname(缓存文件), { recursive: true })
  let 锁文件 = `${缓存文件}.lock`
  let 锁: number
  try {
    锁 = fs.openSync(锁文件, 'wx')
  } catch (错误) {
    if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'EEXIST')
      throw new Error(
        'Web 测试构建正在执行或上次异常退出遗留构建锁，请确认没有构建进程后移除 test-outputs/build-cache/web-test.json.lock',
      )
    throw 错误
  }
  try {
    let 输入 = 计算测试Web输入(根目录, 环境文件, 环境摘要)
    let 记录 = 读取有效缓存(缓存文件)
    let 输出 = 计算测试Web输出(根目录)
    if (输出 !== null && 记录?.输入 === 输入 && 记录.输出 === 输出)
      return { 命中: true, 耗时毫秒: Math.round(performance.now() - 开始) }
    await 参数.生成()
    let 构建输入 = 计算测试Web输入(根目录, 环境文件, 环境摘要)
    await 参数.构建()
    if (计算测试Web输入(根目录, 环境文件, 环境摘要) !== 构建输入)
      throw new Error('Web 测试构建期间输入发生变化，未记录缓存，请在修改完成后重新构建')
    let 构建输出 = 计算测试Web输出(根目录)
    if (构建输出 === null) throw new Error('Web 测试构建没有生成完整前端产物')
    写入缓存(缓存文件, 构建输入, 构建输出)
    return { 命中: false, 耗时毫秒: Math.round(performance.now() - 开始) }
  } finally {
    fs.closeSync(锁)
    fs.unlinkSync(锁文件)
  }
}
