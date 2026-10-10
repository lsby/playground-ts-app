import OSS from 'ali-oss'
import { z } from 'zod'
import type { 云存储仓库, 远端元数据 } from './cloud-store'
import type { OSS凭据, 清单 } from './model'

let 响应头Schema = z
  .object({
    etag: z.string().min(1),
    'content-length': z.union([z.string(), z.number()]),
    'x-oss-hash-crc64ecma': z.union([z.string(), z.number()]),
    'x-oss-version-id': z.string().min(1),
  })
  .passthrough()
let 上传响应头Schema = z.object({ 'x-oss-version-id': z.string().min(1) }).passthrough()

export class 阿里云OSS仓库 implements 云存储仓库 {
  private readonly 客户端: OSS

  public constructor(凭据: OSS凭据) {
    this.客户端 = new OSS({
      region: 凭据.EXTERNAL_LFS_OSS_REGION,
      endpoint: 凭据.EXTERNAL_LFS_OSS_ENDPOINT,
      bucket: 凭据.EXTERNAL_LFS_OSS_BUCKET,
      accessKeyId: 凭据.EXTERNAL_LFS_OSS_ACCESS_KEY_ID,
      accessKeySecret: 凭据.EXTERNAL_LFS_OSS_ACCESS_KEY_SECRET,
      authorizationV4: true,
      secure: true,
    })
  }

  private 解析响应头(输入: object): 远端元数据 {
    let 头 = 响应头Schema.parse(输入)
    let encryptedSize = Number(头['content-length'])
    if (Number.isSafeInteger(encryptedSize) === false || encryptedSize <= 0) throw new Error('OSS 返回了无效文件大小')
    return {
      encryptedSize,
      crc64: String(头['x-oss-hash-crc64ecma']),
      etag: 头.etag,
      versionId: 头['x-oss-version-id'],
    }
  }

  public async 上传(objectKey: string, 文件路径: string): Promise<远端元数据> {
    let 结果 = await this.客户端.put(objectKey, 文件路径)
    let 上传头 = 上传响应头Schema.parse(结果.res.headers)
    if (上传头['x-oss-version-id'] === 'null') throw new Error('OSS Bucket 未开启版本控制，拒绝生成不可追溯清单')
    let 选项: OSS.HeadObjectOptions & { versionId: string } = { versionId: 上传头['x-oss-version-id'] }
    let 查询结果 = await this.客户端.head(objectKey, 选项)
    return this.解析响应头(查询结果.res.headers)
  }

  public async 查询(清单: 清单): Promise<远端元数据> {
    let 选项: OSS.HeadObjectOptions & { versionId: string } = { versionId: 清单.remote.versionId }
    let 结果 = await this.客户端.head(清单.remote.objectKey, 选项)
    return this.解析响应头(结果.res.headers)
  }

  public async 下载(清单: 清单, 文件路径: string): Promise<远端元数据> {
    let 选项: OSS.GetObjectOptions & { versionId: string } = { versionId: 清单.remote.versionId }
    let 结果 = await this.客户端.get(清单.remote.objectKey, 文件路径, 选项)
    return this.解析响应头(结果.res.headers)
  }
}
