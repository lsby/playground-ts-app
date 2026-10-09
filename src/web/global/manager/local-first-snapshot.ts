import { 数据库快照 } from '../../../model/local-first/sync-model'

export function 恢复远程只读同步数据(远程数据库: 数据库快照, 合并数据库: 数据库快照): 数据库快照 {
  let 远程用户列表 = 远程数据库['user']
  if (远程用户列表 === undefined) throw new Error('远程同步快照缺少用户表')
  let 远程用户配置 = 远程数据库['user_config']?.[0]
  if (远程用户配置 === undefined) throw new Error('远程同步快照缺少用户配置')
  let 合并用户配置 = 合并数据库['user_config']?.[0]
  let 用户配置 =
    合并用户配置 === undefined
      ? structuredClone(远程用户配置)
      : {
          ...structuredClone(远程用户配置),
          theme: 合并用户配置['theme'] ?? 远程用户配置['theme'] ?? null,
          updated_at: 合并用户配置['updated_at'] ?? 远程用户配置['updated_at'] ?? null,
        }
  return { ...合并数据库, user: structuredClone(远程用户列表), user_config: [用户配置] }
}
