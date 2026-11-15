import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

export let 浏览器安装命令 = 'pnpm exec playwright install chromium'

/** 项目安装的 Playwright 版本（浏览器版本和它绑定，必须用项目自己的 playwright 命令安装）。 */
function 读取Playwright版本(): string {
  try {
    let 包信息 = createRequire(import.meta.url)('@playwright/test/package.json') as { version?: string }
    return 包信息.version ?? '未知'
  } catch {
    return '未知'
  }
}

export function 生成浏览器未安装提示(): string {
  return `Playwright 浏览器还没有安装（项目固定的 Playwright 版本 ${读取Playwright版本()}）。请在项目根目录运行：${浏览器安装命令}`
}

/** 把 Playwright 启动浏览器时「可执行文件不存在」的错误换成带安装命令的明确提示，其他错误原样返回。 */
export function 转换浏览器启动错误(错误: unknown): unknown {
  if (错误 instanceof Error && /Executable doesn't exist|playwright install/iu.test(错误.message))
    return new Error(生成浏览器未安装提示(), { cause: 错误 })
  return 错误
}

/** dev:test 启动时的检查：没装浏览器返回提示文字，已装返回 undefined。 */
export function 检查浏览器已安装(可执行文件路径: string): string | undefined {
  return existsSync(可执行文件路径) ? undefined : 生成浏览器未安装提示()
}
