import { 扫描本地文件, 文件匹配模式, 读取清单组 } from './local-store'
import type { 外挂LFS配置, 本地文件, 清单 } from './model'
import { 云存储仓库管理器 } from './repository'

export type 操作上下文 = {
  配置: 外挂LFS配置
  scope?: string | undefined
  仓库管理器: 云存储仓库管理器
  清单组: Map<string, 清单>
  本地组: Map<string, 本地文件>
}

export async function 创建上下文(配置: 外挂LFS配置, scope?: string | undefined): Promise<操作上下文> {
  let 清单组 = await 读取清单组(配置)
  let 本地组 = await 扫描本地文件(配置, scope)
  return { 配置, scope, 仓库管理器: new 云存储仓库管理器(配置), 清单组, 本地组 }
}

export function 选中清单(
  上下文: 操作上下文,
  过滤?: { target?: string | undefined; file?: string | undefined },
): 清单[] {
  return [...上下文.清单组.values()]
    .filter((项) => 上下文.scope === undefined || 项.scope === 上下文.scope)
    .filter((项) => 过滤?.target === undefined || 项.remote.target === 过滤.target)
    .filter((项) => 过滤?.file === undefined || 文件匹配模式(项.path, 过滤.file))
    .sort((左, 右) => 左.path.localeCompare(右.path))
}

export function 文件相同(文件: 本地文件, 清单: 清单): boolean {
  return 文件.size === 清单.plaintext.size && 文件.sha256 === 清单.plaintext.sha256
}

export function 格式化文件大小(字节数: number): string {
  if (字节数 < 1024) return `${String(字节数)} B`
  if (字节数 < 1024 * 1024) return `${(字节数 / 1024).toFixed(1)} KB`
  if (字节数 < 1024 * 1024 * 1024) return `${(字节数 / (1024 * 1024)).toFixed(1)} MB`
  return `${(字节数 / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
