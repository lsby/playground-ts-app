import type { 清单 } from './model'

export type 远端元数据 = { encryptedSize: number; crc64: string; etag: string; versionId: string }

export type 云存储仓库 = {
  上传(objectKey: string, 文件路径: string): Promise<远端元数据>
  查询(清单: 清单): Promise<远端元数据>
  下载(清单: 清单, 文件路径: string): Promise<远端元数据>
}

export function 元数据匹配(清单: 清单, 元数据: 远端元数据): boolean {
  return (
    清单.remote.versionId === 元数据.versionId &&
    清单.remote.encryptedSize === 元数据.encryptedSize &&
    清单.remote.crc64 === 元数据.crc64 &&
    清单.remote.etag === 元数据.etag
  )
}
