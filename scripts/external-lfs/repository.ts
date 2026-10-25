import { 阿里云OSS仓库 } from './aliyun-oss'
import type { 云存储仓库 } from './cloud-store'
import { 读取云凭据 } from './config'
import type { 外挂LFS配置 } from './model'
import { 腾讯云COS仓库 } from './tencent-cos'

export class 云存储仓库管理器 {
  private readonly 仓库映射 = new Map<string, 云存储仓库>()

  public constructor(private readonly 配置: 外挂LFS配置) {}

  public 获取仓库(目标名称: string): 云存储仓库 {
    let 已有 = this.仓库映射.get(目标名称)
    if (已有 !== undefined) return 已有
    let 目标配置 = this.配置.targets[目标名称]
    if (目标配置 === undefined) {
      throw new Error(`未声明的存储目标: ${目标名称}`)
    }
    let 云凭据 = 读取云凭据(this.配置, 目标名称)
    let 新仓库: 云存储仓库
    switch (云凭据.provider) {
      case 'aliyun-oss':
        新仓库 = new 阿里云OSS仓库(云凭据.credentials)
        break
      case 'tencent-cos':
        新仓库 = new 腾讯云COS仓库(云凭据.credentials)
        break
    }
    this.仓库映射.set(目标名称, 新仓库)
    return 新仓库
  }
}
