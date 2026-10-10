import { 阿里云OSS仓库 } from './aliyun-oss'
import type { 云存储仓库 } from './cloud-store'
import { 读取云凭据 } from './config'
import type { 外挂LFS配置 } from './model'
import { 腾讯云COS仓库 } from './tencent-cos'

export function 创建云存储仓库(配置: 外挂LFS配置): 云存储仓库 {
  let 云凭据 = 读取云凭据(配置)
  switch (云凭据.provider) {
    case 'aliyun-oss':
      return new 阿里云OSS仓库(云凭据.credentials)
    case 'tencent-cos':
      return new 腾讯云COS仓库(云凭据.credentials)
  }
}
