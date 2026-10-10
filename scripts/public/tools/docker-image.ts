export function 获得待清理旧镜像列表(旧镜像列表: string[], 新镜像列表: string[]): string[] {
  return Array.from(new Set(旧镜像列表)).filter((镜像ID): boolean => 新镜像列表.includes(镜像ID) === false)
}

export function 获得非回滚旧镜像列表(
  旧镜像列表: string[],
  重部署前镜像列表: string[],
  保留镜像ID: string | undefined,
): string[] {
  return Array.from(new Set([...旧镜像列表, ...重部署前镜像列表])).filter((镜像ID): boolean => 镜像ID !== 保留镜像ID)
}

export function 获得Compose回滚镜像名称(镜像名称: string, 标识: string): string {
  let 安全标识 = 标识.replace(/[^a-zA-Z0-9_.-]/gu, '-')
  if (安全标识.length === 0) throw new Error('回滚镜像标识不能为空')
  let 最后斜杠 = 镜像名称.lastIndexOf('/')
  let 最后冒号 = 镜像名称.lastIndexOf(':')
  let 仓库名称 = 最后冒号 > 最后斜杠 ? 镜像名称.slice(0, 最后冒号) : 镜像名称
  if (仓库名称.length === 0) throw new Error(`无法从镜像名称生成回滚标签: ${镜像名称}`)
  return `${仓库名称}:rollback-${安全标识}`
}
